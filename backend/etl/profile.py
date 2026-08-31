"""
FASE 2 · Perfilado: detecta ruido SIN nombrar ninguna columna.

Tres reglas derivadas de los datos. Ninguna columna de ruido está nombrada en
este archivo: se detectan por su comportamiento estadístico. Si mañana suben
otra base con ruido distinto, las reglas lo encuentran igual.

  A · VALOR DOMINANTE      un valor concentra >99% → la columna no informa
  B · PODER DISCRIMINANTE  eta² < 0.01 contra su agrupador → sin información
  C · FRECUENCIA DE CLAVE  clave JSON en <1% de los documentos → ruido inyectado

La Regla A se aplica dos veces: sobre la columna completa (detecta constantes) y
particionada por columnas discriminadoras (detecta relleno estilo EAV, donde el
ruido solo es visible dentro de cada grupo).
"""
from __future__ import annotations
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from psycopg import sql as _sql

MAX_CARD_DISCRIMINADOR = 50     # una columna con más valores distintos no agrupa nada útil
MAX_PROP_DISCRIMINADOR = 0.05   # ...ni si sus distintos son >5% de las filas
PROP_UNICIDAD_CLAVE    = 0.95   # distintos/filas por encima de esto → clave sustituta
SOLAPE_FK_INFERIDA     = 0.50   # cobertura mínima de la clave padre para inferir FK no declarada
MIN_PARTICIONES_RELLENO= 3      # menos que esto es coincidencia de muestra pequeña
MIN_COBERTURA_RELLENO  = 0.20   # el relleno debe cubrir parte sustancial de la tabla
UMBRAL_REDUNDANCIA     = 0.99   # eta² ~1 → la columna es otra columna disfrazada
FILAS_MUESTRA          = 120_000  # tamaño de muestra para las reglas A y B
UMBRAL_MUESTREO        = 200_000  # tablas más grandes que esto se muestrean


def _columnas(cur, tabla: str) -> list[tuple[str, str]]:
    cur.execute(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema='raw' AND table_name=%s AND column_name<>'dataset_id' "
        "ORDER BY ordinal_position", (tabla,))
    return cur.fetchall()


def _tablas(cur) -> list[str]:
    cur.execute("SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='raw' ORDER BY table_name")
    return [r[0] for r in cur.fetchall()]


def _textuales(cols) -> list[str]:
    return [c for c, t in cols if t in ("text", "character varying")]


def _despivote(rel: str, columnas: list[str]) -> str:
    """Todas las columnas de texto en UN escaneo, como pares (columna, valor).

    Evita recorrer la tabla una vez por columna: sobre mensajes (417k filas) eso
    era la diferencia entre ~7s y menos de 1s.
    """
    nombres = ", ".join(_sql.Literal(c).as_string(None) for c in columnas)
    valores = ", ".join(f'"{c}"::text' for c in columnas)
    return (f'SELECT u.col, u.val FROM {rel}, '
            f'LATERAL unnest(ARRAY[{nombres}], ARRAY[{valores}]) AS u(col, val) '
            f'WHERE dataset_id = %s')


def _discriminadores(cur, rel: str, cols, ds, n_filas: int) -> list[str]:
    """Columnas de baja cardinalidad que sirven para particionar (campo, clave, tipo...).

    Se detectan por cardinalidad, no por nombre. Un solo escaneo para todas.
    """
    textuales = _textuales(cols)
    if not textuales:
        return []
    exprs = ", ".join(f'COUNT(DISTINCT "{c}")' for c in textuales)
    cur.execute(f'SELECT {exprs} FROM {rel} WHERE dataset_id=%s', (ds,))
    cardinalidades = cur.fetchone()
    return [c for c, d in zip(textuales, cardinalidades)
            if 2 <= d <= MAX_CARD_DISCRIMINADOR
            and (n_filas == 0 or d / n_filas <= MAX_PROP_DISCRIMINADOR)]


def regla_a(cur, tabla, rel, cols, discriminadores, ds, n_filas, umbral, escala=1.0):
    """Valor dominante: global (detecta constantes) y particionado (detecta relleno).

    Dos escaneos por tabla más uno por discriminador, en vez de uno por cada par
    (columna, discriminador). Sobre las tablas grandes es la diferencia entre
    ~7s y menos de 1s.
    """
    hallazgos = []
    textuales = _textuales(cols)
    if not textuales:
        return hallazgos

    # ── GLOBAL · un escaneo para todas las columnas ──────────────────────────
    cur.execute(f"""
        WITH d AS ({_despivote(rel, textuales)}),
             porval AS (SELECT col, val, COUNT(*) k FROM d WHERE val IS NOT NULL GROUP BY 1, 2)
        SELECT col, MAX(k)::float / SUM(k), SUM(k) FROM porval GROUP BY 1""", (ds,))
    globales = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    constantes = set()
    for col, (ratio, total) in globales.items():
        if total and ratio > umbral:
            constantes.add(col)
            hallazgos.append(dict(regla="A", objetivo=f"{tabla}.{col}", particion=None,
                                  metrica=round(ratio, 6), veredicto="constante",
                                  motivo=f"un solo valor cubre el {ratio:.1%} de las filas no nulas"))

    candidatas = [c for c in textuales if c not in constantes and globales.get(c, (0, 0))[1]]
    if not candidatas:
        return hallazgos

    # ── PARTICIONADO · una consulta por (columna, discriminador) ─────────────
    #
    # Se intentó despivotar acá también, pero salió peor: unnest multiplica las
    # filas por el número de columnas y el COUNT(DISTINCT) sobre ese conjunto
    # explotado cuesta más que las consultas separadas (57s vs 25s en mensajes).
    #
    # Criterio de ASIMETRÍA: una partición degenerada (1 solo valor) es relleno
    # solo si OTRAS particiones de la misma columna sí tienen variedad. Si todas
    # son degeneradas es una dependencia funcional legítima, no basura.
    for col in candidatas:
        for disc in discriminadores:
            if disc == col:
                continue
            cur.execute(
                f'SELECT "{disc}"::text, COUNT(DISTINCT "{col}"), COUNT(*) FROM {rel} '
                f'WHERE dataset_id=%s AND "{col}" IS NOT NULL GROUP BY 1', (ds,))
            grupos = cur.fetchall()
            if len(grupos) < 2:
                continue
            degeneradas = [(g, n) for g, d, n in grupos if d == 1]
            con_variedad = [g for g, d, _ in grupos if d > 2]
            if not degeneradas or not con_variedad:
                continue
            total_tabla = sum(n for _, _, n in grupos)
            if (len(degeneradas) < MIN_PARTICIONES_RELLENO
                    or sum(n for _, n in degeneradas) / total_tabla < MIN_COBERTURA_RELLENO):
                continue
            for grupo, n in degeneradas:
                hallazgos.append(dict(
                    regla="A", objetivo=f"{tabla}.{col}", particion=f"{disc}={grupo}",
                    metrica=1.0, veredicto="relleno", filas=round(n * escala),
                    motivo=f"un solo valor en {n:,} filas, mientras {disc}='{con_variedad[0]}' "
                           f"sí tiene variedad → relleno asimétrico"))
    return hallazgos


def claves_del_esquema(cur, ds) -> dict[str, tuple]:
    """Columnas numéricas casi únicas: son claves sustitutas (los 'id' de cada tabla).

    Se detectan por unicidad, no por nombre.
    """
    claves = {}
    for tabla in _tablas(cur):
        cur.execute(f'SELECT COUNT(*) FROM raw."{tabla}" WHERE dataset_id=%s', (ds,))
        n = cur.fetchone()[0]
        if n == 0:
            continue
        for col, tipo in _columnas(cur, tabla):
            if tipo not in ("bigint", "integer", "smallint"):
                continue
            cur.execute(f'SELECT COUNT(DISTINCT "{col}") FROM raw."{tabla}" WHERE dataset_id=%s', (ds,))
            if cur.fetchone()[0] / n >= PROP_UNICIDAD_CLAVE:
                claves[f"{tabla}.{col}"] = (tabla, col)
    return claves


def _fk_inferida(cur, tabla, col, ds, claves) -> bool:
    """FK no declarada (p.ej. polimórfica): el conjunto de valores COINCIDE con
    el de una clave padre, no solo cabe dentro.

    La diferencia importa: una métrica con rango 0-3500 está CONTENIDA en
    cualquier id que llegue a 3500, pero cubre una fracción mínima de él. Una FK
    real cubre la mayor parte de la clave padre.
    """
    cur.execute(f'SELECT COUNT(DISTINCT "{col}") FROM raw."{tabla}" WHERE dataset_id=%s', (ds,))
    d_col = cur.fetchone()[0]
    if not d_col:
        return False
    for _, (t_dest, c_dest) in claves.items():
        if t_dest == tabla:
            continue
        cur.execute(f'SELECT COUNT(DISTINCT "{c_dest}") FROM raw."{t_dest}" WHERE dataset_id=%s', (ds,))
        d_padre = cur.fetchone()[0]
        if not d_padre or d_col / d_padre < SOLAPE_FK_INFERIDA:
            continue
        cur.execute(
            f'SELECT NOT EXISTS (SELECT 1 FROM raw."{tabla}" a WHERE a.dataset_id=%s '
            f'  AND a."{col}" IS NOT NULL AND NOT EXISTS ('
            f'    SELECT 1 FROM raw."{t_dest}" b WHERE b.dataset_id=%s AND b."{c_dest}"=a."{col}"))',
            (ds, ds))
        if cur.fetchone()[0]:
            return True
    return False


def _es_identificador(tabla, col, claves, fks) -> bool:
    """Identificador = clave propia (casi única) o clave foránea DECLARADA.

    Las FK se leen del esquema de origen, no se infieren por contención de
    valores: una métrica con rango 0-3500 cabe dentro de cualquier id que llegue
    a 3500 y quedaría marcada como FK sin serlo.

    Importa distinguirlas: un identificador nunca es una MÉTRICA, así que
    evaluarlo con eta² produce veredictos correctos pero inútiles — y peligrosos,
    porque el reporte parecería sugerir descartar una clave foránea.
    """
    if f"{tabla}.{col}" in claves:
        return True
    return any(f["tabla"] == tabla and f["columna"] == col for f in fks)


def regla_b(cur, tabla, rel, cols, discriminadores, ds, umbral, claves, fks):
    """eta²: ¿la columna numérica explica varianza entre los grupos?

    Solo sobre MÉTRICAS. Los identificadores se excluyen antes.
    """
    hallazgos = []
    numericas = [c for c, t in cols
                 if t in ("bigint", "integer", "smallint", "double precision", "numeric", "real")]
    numericas = [c for c in numericas
                 if not _es_identificador(tabla, c, claves, fks)
                 and not _fk_inferida(cur, tabla, c, ds, claves)]
    for col in numericas:
        for disc in discriminadores:
            cur.execute(f"""
                WITH d AS (SELECT "{disc}" g, "{col}"::float v FROM {rel}
                           WHERE dataset_id=%s AND "{col}" IS NOT NULL),
                     m AS (SELECT AVG(v) gm FROM d),
                     grp AS (SELECT g, COUNT(*) n, AVG(v) mu FROM d GROUP BY g)
                SELECT (SELECT SUM(n*(mu-gm)^2) FROM grp, m),
                       (SELECT SUM((v-gm)^2) FROM d, m)""", (ds,))
            sb, ss = cur.fetchone()
            if not ss or ss == 0:
                continue
            eta2 = float(sb) / float(ss)
            if eta2 < umbral:
                veredicto, motivo = "sin_informacion", f"eta² = {eta2:.6f}: no distingue nada entre grupos de {disc}"
            elif eta2 >= UMBRAL_REDUNDANCIA:
                veredicto, motivo = "redundante", f"eta² = {eta2:.4f}: queda determinada por {disc}, no aporta información nueva"
            else:
                veredicto, motivo = "informativa", f"eta² = {eta2:.6f} contra {disc}"
            hallazgos.append(dict(regla="B", objetivo=f"{tabla}.{col}", particion=f"vs {disc}",
                                  metrica=round(eta2, 8), veredicto=veredicto, motivo=motivo))
    return hallazgos


def regla_c(cur, tabla, cols, ds, umbral):
    """Frecuencia de claves JSON: las inyectadas aparecen en muy pocos documentos."""
    hallazgos = []
    for col, tipo in cols:
        if tipo != "jsonb":
            continue
        cur.execute(f'SELECT COUNT(*) FROM raw."{tabla}" WHERE dataset_id=%s AND "{col}" IS NOT NULL', (ds,))
        total = cur.fetchone()[0]
        if total == 0:
            continue
        cur.execute(
            f'SELECT k, COUNT(*)::float/{total} FROM raw."{tabla}", LATERAL jsonb_object_keys("{col}") k '
            f'WHERE dataset_id=%s AND "{col}" IS NOT NULL GROUP BY k ORDER BY 2 DESC', (ds,))
        filas = cur.fetchall()
        ruido = [(k, f) for k, f in filas if f < umbral]
        senal = [(k, f) for k, f in filas if f >= umbral]
        if ruido:
            hallazgos.append(dict(
                regla="C", objetivo=f"{tabla}.{col}", particion=None,
                metrica=round(max(f for _, f in ruido), 6), veredicto="claves_ruido",
                motivo=f"{len(ruido)} claves bajo el umbral (máx {max(f for _,f in ruido):.2%}); "
                       f"{len(senal)} conservadas (mín {min(f for _,f in senal):.1%})",
                claves_descartadas=sorted(k for k, _ in ruido),
                claves_conservadas=sorted(k for k, _ in senal)))
    return hallazgos


def _preparar_fuente(cur, tabla: str, dataset_id, n_filas: int) -> tuple[str, float]:
    """Devuelve (relación a escanear, factor de escala).

    Las reglas A y B son estadísticas: con separaciones medidas de 43x a 2.000x
    entre señal y ruido, una muestra de 120k filas da exactamente el mismo
    veredicto que el censo completo. Materializarla una vez evita que los ~17
    escaneos posteriores recorran la tabla entera.

    La Regla C NO se muestrea: ahí queremos el inventario exacto de claves, y una
    clave rara podría no aparecer en la muestra.
    """
    if n_filas <= UMBRAL_MUESTREO:
        return f'raw."{tabla}"', 1.0
    frac = FILAS_MUESTRA / n_filas
    tmp = f"m_{abs(hash(tabla)) % 10**8}"
    # BERNOULLI es muestreo por FILA: insesgado. SYSTEM es por bloque y sesgaría
    # si las filas vienen agrupadas por alguna categoría, que es justo el caso.
    cur.execute(f'CREATE TEMP TABLE {tmp} ON COMMIT DROP AS '
                f'SELECT * FROM raw."{tabla}" TABLESAMPLE BERNOULLI ({frac * 100:.4f}) '
                f'WHERE dataset_id = %s', (dataset_id,))
    cur.execute(f"ANALYZE {tmp}")
    cur.execute(f"SELECT COUNT(*) FROM {tmp}")
    n_muestra = cur.fetchone()[0] or 1
    return tmp, n_filas / n_muestra


def _perfilar_tabla(conectar, tabla, dataset_id, p, claves, fks) -> list[dict]:
    """Perfila UNA tabla en su propia conexión. Pensado para correr en paralelo."""
    with conectar() as conn, conn.cursor() as cur:
        cols = _columnas(cur, tabla)
        cur.execute(f'SELECT COUNT(*) FROM raw."{tabla}" WHERE dataset_id=%s', (dataset_id,))
        n = cur.fetchone()[0]
        if n == 0:
            return []
        rel, escala = _preparar_fuente(cur, tabla, dataset_id, n)
        disc = _discriminadores(cur, rel, cols, dataset_id, n)
        return (regla_a(cur, tabla, rel, cols, disc, dataset_id, n, p["umbral_valor_dominante"], escala)
                + regla_b(cur, tabla, rel, cols, disc, dataset_id, p["umbral_eta2"], claves, fks)
                + regla_c(cur, tabla, cols, dataset_id, p["umbral_frecuencia_clave"]))


def perfilar(conn, dataset_id, cfg: dict, fks: list[dict] | None = None,
             conectar=None, workers: int = 4) -> dict:
    """Aplica las tres reglas sobre raw.*.

    Las tablas se perfilan en paralelo: son independientes entre sí y dos de
    ellas concentran el grueso del trabajo, así que el reloj de pared baja de la
    suma al máximo. Con `conectar=None` corre secuencial en la conexión dada.
    """
    p = cfg["perfilado"]
    fks = fks or []
    reporte = dict(generado_en=datetime.now(timezone.utc).isoformat(),
                   umbrales=dict(valor_dominante=p["umbral_valor_dominante"],
                                 eta2=p["umbral_eta2"],
                                 frecuencia_clave=p["umbral_frecuencia_clave"]),
                   hallazgos=[])
    with conn.cursor() as cur:
        claves = claves_del_esquema(cur, dataset_id)
        tablas = _tablas(cur)
    reporte["claves_detectadas"] = sorted(claves)
    reporte["fks_declaradas"] = len(fks)

    if conectar is None:
        for tabla in tablas:
            with conn.cursor() as cur:
                cols = _columnas(cur, tabla)
                cur.execute(f'SELECT COUNT(*) FROM raw."{tabla}" WHERE dataset_id=%s', (dataset_id,))
                n = cur.fetchone()[0]
                if n == 0:
                    continue
                rel, escala = _preparar_fuente(cur, tabla, dataset_id, n)
                disc = _discriminadores(cur, rel, cols, dataset_id, n)
                reporte["hallazgos"] += regla_a(cur, tabla, rel, cols, disc, dataset_id, n,
                                                p["umbral_valor_dominante"], escala)
                reporte["hallazgos"] += regla_b(cur, tabla, rel, cols, disc, dataset_id,
                                                p["umbral_eta2"], claves, fks)
                reporte["hallazgos"] += regla_c(cur, tabla, cols, dataset_id, p["umbral_frecuencia_clave"])
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futuros = {pool.submit(_perfilar_tabla, conectar, t, dataset_id, p, claves, fks): t
                       for t in tablas}
            for fut in as_completed(futuros):
                reporte["hallazgos"] += fut.result()

    # orden estable: el reporte no debe depender de qué hilo terminó primero
    reporte["hallazgos"].sort(key=lambda h: (h["regla"], h["objetivo"], str(h["particion"])))

    h = reporte["hallazgos"]
    reporte["resumen"] = dict(
        total=len(h),
        columnas_constantes=sum(1 for x in h if x["veredicto"] == "constante"),
        campos_relleno=len({x["objetivo"] + str(x["particion"]) for x in h if x["veredicto"] == "relleno"}),
        numericas_sin_informacion=sum(1 for x in h if x["veredicto"] == "sin_informacion"),
        numericas_redundantes=sum(1 for x in h if x["veredicto"] == "redundante"),
        claves_json_descartadas=sum(len(x.get("claves_descartadas", [])) for x in h))
    return reporte


def guardar(conn, dataset_id, reporte: dict) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE control.datasets SET perfil=%s WHERE id=%s",
                    (json.dumps(reporte), dataset_id))
