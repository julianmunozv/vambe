"""
FASE 1 · Ingesta: SQLite → raw.*

Copia FIEL, tabla por tabla. Sin lógica de negocio, sin filtros, sin descartar
nada — ni siquiera lo que ya sabemos que es ruido. Filtrar acá hardcodearía lo
que todo el diseño evita, y dejaría al perfilado sin nada que detectar: las
reglas A/B/C necesitan el ruido presente para poder reportarlo.

El esquema se introspecciona desde sqlite_master, así que esto funciona sobre
cualquier base, no solo la de Vambe. Lo único que se agrega es dataset_id.
"""
from __future__ import annotations
import json, sqlite3, uuid
from dataclasses import dataclass

# SQLite es de tipado dinámico: el tipo declarado es una sugerencia. Mapeamos
# por afinidad, igual que hace SQLite internamente.
AFINIDAD = [
    ("INT",             "bigint"),
    ("CHAR",            "text"),
    ("CLOB",            "text"),
    ("TEXT",            "text"),
    ("BLOB",            "bytea"),
    ("REAL",            "double precision"),
    ("FLOA",            "double precision"),
    ("DOUB",            "double precision"),
]
MUESTRA_JSON = 200        # valores a inspeccionar para decidir si una columna es JSON
UMBRAL_JSON  = 0.9        # proporción que debe parsear como objeto/array


@dataclass
class Columna:
    nombre: str
    tipo_pg: str
    es_json: bool


def _tipo_pg(declarado: str) -> str:
    d = (declarado or "").upper()
    for patron, pg in AFINIDAD:
        if patron in d:
            return pg
    return "text"          # afinidad NUMERIC/BLANK → text preserva el valor tal cual


def _es_columna_json(con: sqlite3.Connection, tabla: str, col: str) -> bool:
    """Detecta columnas JSON por contenido, no por nombre.

    Deliberado: no hay una lista de 'payload, argumentos, resultado' en ningún
    lado. Otra base con columnas JSON de otro nombre se detecta igual.
    """
    filas = con.execute(
        f'SELECT "{col}" FROM "{tabla}" WHERE "{col}" IS NOT NULL LIMIT {MUESTRA_JSON}'
    ).fetchall()
    if not filas:
        return False
    ok = 0
    for (v,) in filas:
        if not isinstance(v, str):
            return False
        try:
            if isinstance(json.loads(v), (dict, list)):
                ok += 1
        except (ValueError, TypeError):
            pass
    return ok / len(filas) >= UMBRAL_JSON


def leer_esquema(con: sqlite3.Connection) -> dict[str, list[Columna]]:
    tablas = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )]
    esquema: dict[str, list[Columna]] = {}
    for t in tablas:
        cols = []
        for _, nombre, declarado, *_ in con.execute(f'PRAGMA table_info("{t}")'):
            pg = _tipo_pg(declarado)
            json_ = pg == "text" and _es_columna_json(con, t, nombre)
            cols.append(Columna(nombre, "jsonb" if json_ else pg, json_))
        esquema[t] = cols
    return esquema


def _crear_tabla(cur, tabla: str, cols: list[Columna]) -> None:
    """Crea la tabla SIN índices.

    Los índices se crean después del COPY: mantenerlos actualizados durante la
    carga de 1,17M filas cuesta más que construirlos de una vez al final.
    """
    defs = ", ".join(f'"{c.nombre}" {c.tipo_pg}' for c in cols)
    cur.execute(f'CREATE TABLE IF NOT EXISTS raw."{tabla}" (dataset_id uuid NOT NULL, {defs})')


def _indexar(cur, tabla: str, cols: list[Columna]) -> None:
    """Índices posteriores a la carga: dataset_id y las FK que usan los joins."""
    cur.execute(f'CREATE INDEX IF NOT EXISTS "idx_raw_{tabla}_ds" ON raw."{tabla}" (dataset_id)')
    nombres = {c.nombre for c in cols}
    for fk in ("contacto_id", "entidad_id", "id"):
        if fk in nombres:
            cur.execute(f'CREATE INDEX IF NOT EXISTS "idx_raw_{tabla}_{fk}" '
                        f'ON raw."{tabla}" (dataset_id, "{fk}")')


def _verificar_esquema_compatible(cur, tabla: str, cols: list[Columna]) -> None:
    """Si la tabla ya existe de otro dataset, las columnas deben calzar.

    Falla ruidosamente en vez de insertar en una forma distinta.
    """
    existentes = [r[0] for r in cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='raw' AND table_name=%s AND column_name<>'dataset_id' "
        "ORDER BY ordinal_position", (tabla,))]
    if not existentes:
        return
    esperadas = [c.nombre for c in cols]
    if existentes != esperadas:
        raise ValueError(
            f'raw."{tabla}" ya existe con otras columnas.\n'
            f'  en la base:  {existentes}\n'
            f'  en el .db:   {esperadas}'
        )


def ingerir(sqlite_path: str, dataset_id: uuid.UUID, conn, progreso=None) -> dict[str, int]:
    """Copia todas las tablas del SQLite a raw.*. Devuelve conteo por tabla."""
    con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    con.text_factory = bytes                      # evita fallar en texto mal codificado
    try:
        con.text_factory = str
        esquema = leer_esquema(con)
        conteos: dict[str, int] = {}
        with conn.cursor() as cur:
            for i, (tabla, cols) in enumerate(esquema.items(), 1):
                if progreso:
                    progreso(int(100 * i / len(esquema)), f"copiando {tabla}")
                _verificar_esquema_compatible(cur, tabla, cols)
                _crear_tabla(cur, tabla, cols)
                # idempotencia: re-ingerir el mismo dataset lo reemplaza
                cur.execute(f'DELETE FROM raw."{tabla}" WHERE dataset_id = %s', (dataset_id,))

                lista = ", ".join(f'"{c.nombre}"' for c in cols)
                sql = f'COPY raw."{tabla}" (dataset_id, {lista}) FROM STDIN'
                n = 0
                with cur.copy(sql) as copy:
                    cursor = con.execute(f'SELECT {lista} FROM "{tabla}"')
                    while (lote := cursor.fetchmany(5000)):
                        for fila in lote:
                            copy.write_row((dataset_id, *fila))
                            n += 1
                conteos[tabla] = n
            for tabla, cols in esquema.items():
                _indexar(cur, tabla, cols)
        return conteos
    finally:
        con.close()


def conteos_origen(sqlite_path: str) -> dict[str, int]:
    """Conteo de filas directo del SQLite, para verificar fidelidad tras copiar."""
    con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    try:
        tablas = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        return {t: con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tablas}
    finally:
        con.close()


def leer_fks(sqlite_path: str) -> list[dict]:
    """Claves foráneas DECLARADAS en el esquema de origen.

    Se leen, no se infieren. Inferirlas por contención de valores da falsos
    positivos: una métrica con rango 0-3500 "cabe" dentro de cualquier id que
    llegue a 3500, y quedaría marcada como clave foránea sin serlo.
    """
    con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    try:
        fks = []
        for (t,) in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
            for f in con.execute(f'PRAGMA foreign_key_list("{t}")'):
                fks.append({"tabla": t, "columna": f[3], "ref_tabla": f[2], "ref_columna": f[4]})
        return fks
    finally:
        con.close()
