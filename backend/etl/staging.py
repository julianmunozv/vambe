"""
FASE 3 · Staging: vistas que limpian, sin combinar.

Cada vista lee de UNA tabla de hechos (más dimensiones pequeñas para decodificar
ids a nombres). Los cruces entre hechos son trabajo de analytics.

Lo importante: las decisiones de limpieza NO están escritas acá. Salen de dos
fuentes, y esta capa solo las aplica:

  · el REPORTE DE PERFILADO  → qué claves JSON conservar, qué campos son relleno
  · el CONFIG DECLARADO      → el orden de la cascada de atribución

Por eso el SQL se arma en Python: los literales se inyectan desde esas fuentes
en vez de quedar tipeados en un .sql que nadie vuelve a mirar.
"""
from __future__ import annotations

from psycopg import sql as _sql


def _arreglo(valores: list[str]) -> str:
    """Lista Python → literal ARRAY[...] de Postgres, con escapado seguro.

    Una VISTA es una query almacenada: no admite parámetros ligados, así que el
    valor tiene que quedar literal en la definición. Se compone con psycopg.sql
    para que un valor con comillas no rompa nada.
    """
    if not valores:
        return "ARRAY[]::text[]"
    items = _sql.SQL(", ").join(_sql.Literal(v) for v in valores)
    return _sql.SQL("ARRAY[{}]::text[]").format(items).as_string(None)


# ── lecturas del reporte de perfilado ────────────────────────────────────────

def claves_conservadas(perfil: dict, objetivo: str) -> list[str]:
    """Claves JSON que superaron el umbral de la Regla C."""
    for h in perfil["hallazgos"]:
        if h["regla"] == "C" and h["objetivo"] == objetivo:
            return h["claves_conservadas"]
    raise KeyError(f"el perfilado no reportó claves para {objetivo}")


def particiones_relleno(perfil: dict, objetivo: str, discriminador: str) -> list[str]:
    """Valores del discriminador cuyas filas la Regla A marcó como relleno.

    Para registros_cambios esto devuelve los campos de relleno; lo que NO está
    en la lista es la señal. Así el filtro se deriva del perfilado en vez de
    nombrar a mano el campo bueno.
    """
    pref = f"{discriminador}="
    return sorted({h["particion"][len(pref):]
                   for h in perfil["hallazgos"]
                   if h["veredicto"] == "relleno" and h["objetivo"] == objetivo
                   and (h["particion"] or "").startswith(pref)})


# ── construcción de las vistas ───────────────────────────────────────────────

def sql_atribucion(cfg: dict, perfil: dict) -> str:
    """Un lead, un canal. Cascada declarada en config.yml, aplicada en orden."""
    claves = claves_conservadas(perfil, "mensajes.payload")
    ramas = []
    for paso in cfg["atribucion"]["cascada"]:
        if paso["fuente"] != "mensajes.payload":
            continue
        # 'a.b' → payload->'a'->>'b'   ·   'a' → payload->>'a'
        partes = paso["clave"].split(".")
        expr = "p.payload" + "".join(f"->'{x}'" for x in partes[:-1]) + f"->>'{partes[-1]}'"
        ramas.append((paso["canal"], expr))

    casos_canal = "\n           ".join(
        f"WHEN {expr} IS NOT NULL THEN '{canal}'" for canal, expr in ramas)
    casos_detalle = "\n           ".join(
        f"WHEN {expr} IS NOT NULL THEN {expr}" for canal, expr in ramas)
    expr_ad = next(e for c, e in ramas if c == "ad")

    arreglo_claves = _arreglo(claves)
    return f"""
CREATE OR REPLACE VIEW stg.atribucion AS
WITH primero AS (
    -- ATRIBUCIÓN FIRST-TOUCH (decisión declarada en config.yml).
    -- 1.761 leads tienen más de un payload y el 98,2% se contradicen: el primer
    -- mensaje mide ADQUISICIÓN. Los toques completos viven en fct_touchpoints,
    -- así que la decisión es reversible sin perder información.
    SELECT dataset_id, contacto_id, id, enviado_en,
           -- solo las claves que la Regla C dejó pasar; el resto es ruido inyectado
           (SELECT jsonb_object_agg(e.k, e.v) FROM jsonb_each(payload) AS e(k, v)
             WHERE e.k = ANY({arreglo_claves})) AS payload,
           -- desempate por id: sin él, dos mensajes en el mismo instante
           -- cambian el "primer toque" entre corridas y con él la atribución
           ROW_NUMBER() OVER (PARTITION BY dataset_id, contacto_id
                                  ORDER BY enviado_en, id) AS rn
      FROM raw.mensajes
     WHERE payload IS NOT NULL
),
crm AS (
    -- Fallback: recupera los leads sin señal entrante en el payload.
    -- Verificado por contrato que el valor es constante por contacto.
    SELECT dataset_id, contacto_id, MIN(payload->>'source') AS source
      FROM raw.integracion_crm
     WHERE payload ? 'source'
     GROUP BY 1, 2
)
SELECT c.dataset_id,
       c.id AS contacto_id,
       COALESCE(
         CASE {casos_canal}
         END,
         'crm:' || crm.source,
         'sin_atribucion') AS canal_bruto,
       CASE {casos_detalle}
            ELSE crm.source
       END AS origen_detalle,
       -- source_id es TEXT en catalogo_anuncios: castearlo rompe el join en silencio
       {expr_ad} AS ad_id,
       p.enviado_en AS primer_contacto_en
  FROM raw.contactos c
  LEFT JOIN primero p ON p.dataset_id = c.dataset_id AND p.contacto_id = c.id AND p.rn = 1
  LEFT JOIN crm      ON crm.dataset_id = c.dataset_id AND crm.contacto_id = c.id;
"""


def sql_metadata(conn, dataset_id) -> str:
    """Pivot del EAV. Las claves se leen de los datos, no se listan a mano."""
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT clave FROM raw.metadata_contacto "
                    "WHERE dataset_id=%s ORDER BY 1", (dataset_id,))
        claves = [r[0] for r in cur.fetchall()]
    cols = ",\n       ".join(
        f"MAX(valor) FILTER (WHERE clave = '{k}') AS {k}" for k in claves)
    return f"""
CREATE OR REPLACE VIEW stg.metadata AS
SELECT dataset_id, contacto_id,
       {cols}
  FROM raw.metadata_contacto
 GROUP BY 1, 2;
"""


def sql_transiciones(perfil: dict) -> str:
    """Solo los campos que NO son relleno, según la Regla A."""
    relleno = particiones_relleno(perfil, "registros_cambios.valor_nuevo", "campo")
    if not relleno:
        raise ValueError("el perfilado no detectó campos de relleno: revisar umbrales")
    arreglo_relleno = _arreglo(relleno)
    return f"""
CREATE OR REPLACE VIEW stg.transiciones AS
-- El filtro sale del perfilado: se excluyen los campos que la Regla A marcó como
-- relleno (valor único en toda su partición mientras otras sí varían). Lo que
-- queda es la señal, sin que ningún nombre de campo esté escrito acá.
SELECT rc.dataset_id,
       rc.entidad_id                          AS contacto_id,
       ea.nombre                              AS etapa_desde,
       eb.nombre                              AS etapa_hasta,
       ea.orden                               AS orden_desde,
       eb.orden                               AS orden_hasta,
       eb.es_terminal <> 0                    AS llega_a_terminal,
       rc.autor_tipo,
       rc.creado_en::timestamptz              AS ocurrido_en
  FROM raw.registros_cambios rc
  LEFT JOIN raw.etapas_embudo ea
         ON ea.dataset_id = rc.dataset_id AND ea.id = rc.valor_anterior::bigint
  JOIN      raw.etapas_embudo eb
         ON eb.dataset_id = rc.dataset_id AND eb.id = rc.valor_nuevo::bigint
 WHERE rc.campo <> ALL ({arreglo_relleno});
"""


SQL_CITAS = """
CREATE OR REPLACE VIEW stg.citas AS
SELECT dataset_id, id, contacto_id, vendedor_id, tipo, estado, sucursal,
       modelo_interes                       AS modelo,
       estado = 'no_show'                   AS es_no_show,
       agendada_para::timestamptz           AS agendada_para,
       creada_en::timestamptz               AS creada_en
  FROM raw.citas;
"""

SQL_TOOL_CALLS = """
CREATE OR REPLACE VIEW stg.tool_calls AS
-- Sin duracion_ms (la Regla B la descartó) ni el resultado (auditoría de
-- coherencia: su flag de calificación no correlaciona con su propio score).
SELECT dataset_id, id, contacto_id, asistente_id,
       nombre_herramienta                   AS herramienta,
       exito <> 0                           AS exito,
       argumentos,
       ejecutada_en::timestamptz            AS ejecutada_en
  FROM raw.llamadas_herramienta;
"""

SQL_MENSAJES = """
CREATE OR REPLACE VIEW stg.mensajes AS
-- Sin contenido (13.161 frases enlatadas; frases de significado opuesto
-- convierten igual) ni es_automatico (eta² = 1,0 contra remitente_tipo: la
-- Regla B lo marcó redundante, no aporta información nueva).
SELECT dataset_id, id, contacto_id, direccion, remitente_tipo, remitente_id,
       canal, template_id,
       enviado_en::timestamptz              AS enviado_en
  FROM raw.mensajes;
"""


def construir(conn, dataset_id, cfg: dict, perfil: dict) -> list[str]:
    """Crea las vistas. Devuelve los nombres creados."""
    with conn.cursor() as cur:
        cur.execute("CREATE SCHEMA IF NOT EXISTS stg")
        cur.execute(sql_atribucion(cfg, perfil))
        cur.execute(sql_metadata(conn, dataset_id))
        cur.execute(sql_transiciones(perfil))
        for s in (SQL_CITAS, SQL_TOOL_CALLS, SQL_MENSAJES):
            cur.execute(s)
        cur.execute("SELECT table_name FROM information_schema.views "
                    "WHERE table_schema='stg' ORDER BY 1")
        return [r[0] for r in cur.fetchall()]
