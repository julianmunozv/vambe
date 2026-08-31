"""
FASE 4 · Analytics: las tablas que ven el dashboard y las queries de KPI.

Grano por tabla — cada pregunta se responde leyendo UNA sola:

    fct_leads         1 fila por lead        ← la ÚNICA autoridad para contar leads
    fct_touchpoints   1 fila por toque       recorridos multicanal, first vs last
    fct_estadias      1 fila por ocupación   días en cada etapa, incluidos los abiertos
    fct_transiciones  1 fila por movimiento  quién mueve el embudo, qué saltos hay
    fct_citas         1 fila por cita        no-show por tipo y sucursal
    fct_tool_calls    1 fila por llamada     fallos por herramienta

Regla dura: los leads se cuentan SOLO desde fct_leads. Contar desde una tabla de
grano más fino infla los totales — contar payloads en vez de leads infla el canal
orgánico un 20,3% y hunde su conversión de 24,7% a ~20,5%.
"""
from __future__ import annotations

from psycopg import sql as _sql


def _lit(v) -> str:
    return _sql.Literal(v).as_string(None)


def _ident(v: str) -> str:
    return _sql.Identifier(v).as_string(None)


# ── dimensiones ──────────────────────────────────────────────────────────────

DIMENSIONES = """
DROP TABLE IF EXISTS analytics.dim_anuncios CASCADE;
CREATE TABLE analytics.dim_anuncios AS
SELECT dataset_id, ad_id, platform, campaign_name, adset_name, objetivo
  FROM raw.catalogo_anuncios;

DROP TABLE IF EXISTS analytics.dim_etapas CASCADE;
CREATE TABLE analytics.dim_etapas AS
SELECT e.dataset_id, e.id AS etapa_id, em.nombre AS embudo, e.nombre,
       e.orden, e.es_terminal <> 0 AS es_terminal
  FROM raw.etapas_embudo e
  JOIN raw.embudos em ON em.dataset_id = e.dataset_id AND em.id = e.embudo_id;

DROP TABLE IF EXISTS analytics.dim_equipo CASCADE;
CREATE TABLE analytics.dim_equipo AS
SELECT dataset_id, id AS vendedor_id, nombre, rol, activo <> 0 AS activo,
       fecha_ingreso::date AS fecha_ingreso
  FROM raw.miembros_equipo;
"""


# ── hechos de grano fino ─────────────────────────────────────────────────────

FCT_TRANSICIONES = """
DROP TABLE IF EXISTS analytics.fct_transiciones CASCADE;
CREATE TABLE analytics.fct_transiciones AS
SELECT dataset_id, contacto_id, etapa_desde, etapa_hasta, orden_desde, orden_hasta,
       llega_a_terminal, autor_tipo, ocurrido_en,
       ROW_NUMBER() OVER (PARTITION BY dataset_id, contacto_id ORDER BY ocurrido_en) AS n_movimiento,
       orden_hasta - orden_desde AS salto
  FROM stg.transiciones;
"""

FCT_CITAS = """
DROP TABLE IF EXISTS analytics.fct_citas CASCADE;
CREATE TABLE analytics.fct_citas AS
SELECT dataset_id, id, contacto_id, vendedor_id, tipo, estado, sucursal, modelo,
       es_no_show, agendada_para, creada_en
  FROM stg.citas;
"""

FCT_TOOL_CALLS = """
DROP TABLE IF EXISTS analytics.fct_tool_calls CASCADE;
CREATE TABLE analytics.fct_tool_calls AS
SELECT dataset_id, id, contacto_id, asistente_id, herramienta, exito, ejecutada_en
  FROM stg.tool_calls;
"""


def fct_estadias(cfg: dict) -> str:
    """Una fila por (lead, etapa ocupada), con los intervalos abiertos incluidos.

    Existe porque LAG() sobre las transiciones deja dos huecos:
      · la PRIMERA etapa no tiene transición previa → se ancla a contactos.creado_en
      · la etapa ACTUAL sigue abierta → se cierra contra la fecha de corte del dataset

    Sin esto no se ven ni los leads que nunca se trabajaron ni los estancados,
    que son el 42% de la base.
    """
    return """
DROP TABLE IF EXISTS analytics.fct_estadias CASCADE;
CREATE TABLE analytics.fct_estadias AS
WITH corte AS (
    SELECT dataset_id, MAX(ocurrido_en) AS hasta
      FROM analytics.fct_transiciones GROUP BY 1
),
base AS (
    -- El embudo del contacto se resuelve UNA vez acá y se arrastra. Resolverlo
    -- por fila con una subconsulta correlacionada costaba 435s sobre 109k filas.
    SELECT c.dataset_id, c.id AS contacto_id, em.nombre AS embudo,
           c.creado_en::timestamptz AS creado_en, de.nombre AS etapa_actual
      FROM raw.contactos c
      JOIN raw.embudos em
        ON em.dataset_id = c.dataset_id AND em.id = c.embudo_id
      JOIN analytics.dim_etapas de
        ON de.dataset_id = c.dataset_id AND de.etapa_id = c.etapa_actual_id
),
inicial AS (
    -- Estadía en la etapa de entrada: desde que se creó el contacto hasta su
    -- primer movimiento (o hasta el corte, si nunca se movió).
    SELECT b.dataset_id, b.contacto_id, b.embudo,
           COALESCE(t.etapa_desde, b.etapa_actual) AS etapa,
           b.creado_en                             AS entro_en,
           t.ocurrido_en                           AS salio_en,
           t.etapa_hasta                           AS salio_hacia
      FROM base b
      LEFT JOIN analytics.fct_transiciones t
        ON t.dataset_id = b.dataset_id AND t.contacto_id = b.contacto_id AND t.n_movimiento = 1
),
posteriores AS (
    -- Cada movimiento abre una estadía que cierra con el movimiento siguiente.
    SELECT t.dataset_id, t.contacto_id, b.embudo, t.etapa_hasta AS etapa,
           t.ocurrido_en AS entro_en,
           LEAD(t.ocurrido_en) OVER w  AS salio_en,
           LEAD(t.etapa_hasta) OVER w  AS salio_hacia
      FROM analytics.fct_transiciones t
      JOIN base b ON b.dataset_id = t.dataset_id AND b.contacto_id = t.contacto_id
    WINDOW w AS (PARTITION BY t.dataset_id, t.contacto_id ORDER BY t.ocurrido_en)
),
todas AS (
    SELECT * FROM inicial UNION ALL SELECT * FROM posteriores
)
SELECT t.dataset_id, t.contacto_id, t.etapa, de.orden, de.es_terminal,
       t.entro_en, t.salio_en, t.salio_hacia,
       t.salio_en IS NULL AS es_actual,
       ROUND(EXTRACT(EPOCH FROM COALESCE(t.salio_en, co.hasta) - t.entro_en) / 86400.0, 2) AS dias
  FROM todas t
  JOIN corte co ON co.dataset_id = t.dataset_id
  LEFT JOIN analytics.dim_etapas de
    ON de.dataset_id = t.dataset_id AND de.nombre = t.etapa AND de.embudo = t.embudo;
"""


def fct_touchpoints(cfg: dict, claves: list[str]) -> str:
    """Una fila por toque de atribución. NUNCA se usa para contar leads."""
    ramas = []
    for paso in cfg["atribucion"]["cascada"]:
        if paso["fuente"] != "mensajes.payload":
            continue
        partes = paso["clave"].split(".")
        expr = "payload" + "".join(f"->'{x}'" for x in partes[:-1]) + f"->>'{partes[-1]}'"
        ramas.append((paso["canal"], expr))
    casos = "\n                 ".join(f"WHEN {e} IS NOT NULL THEN {_lit(c)}" for c, e in ramas)
    detalle = "\n                 ".join(f"WHEN {e} IS NOT NULL THEN {e}" for c, e in ramas)
    expr_ad = next(e for c, e in ramas if c == "ad")
    arr = _sql.SQL("ARRAY[{}]::text[]").format(
        _sql.SQL(", ").join(_sql.Literal(k) for k in claves)).as_string(None)
    return f"""
DROP TABLE IF EXISTS analytics.fct_touchpoints CASCADE;
CREATE TABLE analytics.fct_touchpoints AS
WITH limpio AS (
    SELECT dataset_id, contacto_id, enviado_en::timestamptz AS ocurrido_en,
           (SELECT jsonb_object_agg(e.k, e.v) FROM jsonb_each(payload) AS e(k, v)
             WHERE e.k = ANY({arr})) AS payload
      FROM raw.mensajes WHERE payload IS NOT NULL
)
SELECT l.dataset_id, l.contacto_id, l.ocurrido_en,
       ROW_NUMBER() OVER (PARTITION BY l.dataset_id, l.contacto_id ORDER BY l.ocurrido_en) AS n_toque,
       ROW_NUMBER() OVER (PARTITION BY l.dataset_id, l.contacto_id ORDER BY l.ocurrido_en) = 1 AS es_primero,
       ROW_NUMBER() OVER (PARTITION BY l.dataset_id, l.contacto_id ORDER BY l.ocurrido_en DESC) = 1 AS es_ultimo,
       COALESCE(CASE {casos} END, 'outbound') AS canal,
       CASE {detalle} END AS origen_detalle,
       da.campaign_name AS campana,
       da.objetivo
  FROM limpio l
  LEFT JOIN analytics.dim_anuncios da
    ON da.dataset_id = l.dataset_id AND da.ad_id = ({expr_ad});
"""


# ── la tabla central ─────────────────────────────────────────────────────────

def fct_leads(conn, dataset_id, cfg: dict) -> str:
    sem = cfg["semantica"]
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT herramienta FROM stg.tool_calls WHERE dataset_id=%s ORDER BY 1",
                    (dataset_id,))
        herramientas = [r[0] for r in cur.fetchall()]
        cur.execute("SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='stg' AND table_name='metadata' "
                    "AND column_name NOT IN ('dataset_id','contacto_id') ORDER BY ordinal_position")
        meta_cols = [r[0] for r in cur.fetchall()]

    # pivot de herramientas: las columnas salen de los datos, no de una lista fija
    cols_tool = ",\n       ".join(
        f"COALESCE(bool_or(tc.herramienta = {_lit(h)}), false) AS {_ident('uso_' + h)}"
        for h in herramientas)
    cols_meta = ",\n       ".join(f"m.{_ident(c)}" for c in meta_cols)
    # columnas booleanas de uso de herramienta, calificadas para no duplicar las llaves
    cols_uso = ",\n       ".join(f"COALESCE(tools.{_ident('uso_' + h)}, false) AS {_ident('uso_' + h)}"
                                 for h in herramientas)

    return f"""
DROP TABLE IF EXISTS analytics.fct_leads CASCADE;
CREATE TABLE analytics.fct_leads AS
WITH tools AS (
    SELECT dataset_id, contacto_id,
       {cols_tool},
       MIN(ejecutada_en) FILTER (WHERE herramienta = {_lit(sem['herramienta_escalamiento'])})
           AS escalado_en
      FROM stg.tool_calls tc GROUP BY 1, 2
),
msg AS (
    SELECT dataset_id, contacto_id,
           COUNT(*)                                                        AS n_mensajes,
           COUNT(*) FILTER (WHERE remitente_tipo = {_lit(sem['remitente_asistente'])}) AS n_msg_asistente,
           COUNT(*) FILTER (WHERE remitente_tipo = {_lit(sem['remitente_humano'])})     AS n_msg_vendedor,
           MODE() WITHIN GROUP (ORDER BY canal)                            AS canal_conversacion
      FROM stg.mensajes GROUP BY 1, 2
),
respuesta AS (
    -- Primer mensaje humano POSTERIOR al escalamiento. Si no existe, el lead
    -- fue escalado y nadie lo atendió nunca.
    SELECT t.dataset_id, t.contacto_id, MIN(m.enviado_en) AS respondido_en
      FROM tools t
      JOIN stg.mensajes m
        ON m.dataset_id = t.dataset_id AND m.contacto_id = t.contacto_id
       AND m.remitente_tipo = {_lit(sem['remitente_humano'])}
       AND m.enviado_en > t.escalado_en
     WHERE t.escalado_en IS NOT NULL
     GROUP BY 1, 2
),
profundidad AS (
    -- Etapa más profunda alcanzada, excluyendo terminales: responde "dónde
    -- murió" un lead perdido. No existe en ninguna tabla del origen.
    SELECT dataset_id, contacto_id, MAX(orden) AS orden_max
      FROM analytics.fct_estadias WHERE NOT es_terminal GROUP BY 1, 2
),
recorrido AS (
    SELECT dataset_id, contacto_id, COUNT(*) AS n_toques
      FROM analytics.fct_touchpoints GROUP BY 1, 2
),
tiempos AS (
    SELECT dataset_id, contacto_id,
           ROUND(EXTRACT(EPOCH FROM MAX(ocurrido_en) - MIN(ocurrido_en)) / 86400.0, 2) AS dias_en_embudo
      FROM analytics.fct_transiciones GROUP BY 1, 2
)
SELECT c.dataset_id,
       c.id                                     AS contacto_id,
       c.ciudad,
       c.vendedor_id,
       c.creado_en::timestamptz                 AS creado_en,
       to_char(c.creado_en::timestamptz, 'YYYY-MM') AS mes,
       de.embudo,
       de.nombre                                AS etapa_actual,
       de.es_terminal,
       de.nombre = {_lit(sem['etapa_exito'])}   AS es_ganado,
       de.es_terminal AND de.nombre <> {_lit(sem['etapa_exito'])} AS es_perdido,
       prof.nombre                              AS etapa_mas_profunda,
       t.dias_en_embudo,
       -- atribución first-touch; 'crm:x' se normaliza al canal que representa
       split_part(a.canal_bruto, ':', 1) = 'crm' AS canal_desde_crm,
       CASE WHEN a.canal_bruto LIKE 'crm:%' THEN 'outbound' ELSE a.canal_bruto END AS canal,
       a.origen_detalle,
       da.campaign_name                         AS campana,
       da.objetivo,
       da.platform,
       COALESCE(r.n_toques, 0)                  AS n_toques,
       {cols_meta},
       COALESCE(msg.n_mensajes, 0)              AS n_mensajes,
       COALESCE(msg.n_msg_asistente, 0)         AS n_msg_asistente,
       COALESCE(msg.n_msg_vendedor, 0)          AS n_msg_vendedor,
       msg.canal_conversacion,
       tools.escalado_en IS NOT NULL            AS transferido,
       resp.respondido_en IS NOT NULL           AS respondido_por_humano,
       ROUND(EXTRACT(EPOCH FROM resp.respondido_en - tools.escalado_en) / 3600.0, 2) AS horas_a_respuesta,
       COALESCE(cit.tiene_test_drive, false)    AS test_drive,
       COALESCE(cit.tuvo_no_show, false)        AS no_show,
       COALESCE(cam.recibio, false)             AS campana_recibida,
       {cols_uso}
  FROM raw.contactos c
  JOIN analytics.dim_etapas de
    ON de.dataset_id = c.dataset_id AND de.etapa_id = c.etapa_actual_id
  LEFT JOIN stg.atribucion a  ON a.dataset_id = c.dataset_id AND a.contacto_id = c.id
  LEFT JOIN analytics.dim_anuncios da ON da.dataset_id = c.dataset_id AND da.ad_id = a.ad_id
  LEFT JOIN stg.metadata m    ON m.dataset_id = c.dataset_id AND m.contacto_id = c.id
  LEFT JOIN tools             ON tools.dataset_id = c.dataset_id AND tools.contacto_id = c.id
  LEFT JOIN msg               ON msg.dataset_id = c.dataset_id AND msg.contacto_id = c.id
  LEFT JOIN respuesta resp    ON resp.dataset_id = c.dataset_id AND resp.contacto_id = c.id
  LEFT JOIN recorrido r       ON r.dataset_id = c.dataset_id AND r.contacto_id = c.id
  LEFT JOIN tiempos t         ON t.dataset_id = c.dataset_id AND t.contacto_id = c.id
  LEFT JOIN profundidad p     ON p.dataset_id = c.dataset_id AND p.contacto_id = c.id
  LEFT JOIN analytics.dim_etapas prof
    ON prof.dataset_id = c.dataset_id AND prof.orden = p.orden_max AND prof.embudo = de.embudo
  LEFT JOIN (SELECT dataset_id, contacto_id,
                    bool_or(tipo = 'test_drive') AS tiene_test_drive,
                    bool_or(es_no_show)          AS tuvo_no_show
               FROM stg.citas GROUP BY 1, 2) cit
    ON cit.dataset_id = c.dataset_id AND cit.contacto_id = c.id
  LEFT JOIN (SELECT dataset_id, contacto_id, true AS recibio
               FROM raw.campana_contactos GROUP BY 1, 2) cam
    ON cam.dataset_id = c.dataset_id AND cam.contacto_id = c.id;
"""


INDICES = """
CREATE INDEX ON analytics.fct_leads (dataset_id, canal);
CREATE INDEX ON analytics.fct_leads (dataset_id, etapa_actual);
CREATE INDEX ON analytics.fct_leads (dataset_id, mes);
CREATE INDEX ON analytics.fct_leads (dataset_id, contacto_id);
CREATE INDEX ON analytics.fct_estadias (dataset_id, etapa);
CREATE INDEX ON analytics.fct_estadias (dataset_id, contacto_id);
CREATE INDEX ON analytics.fct_transiciones (dataset_id, contacto_id);
CREATE INDEX ON analytics.fct_touchpoints (dataset_id, contacto_id);
CREATE INDEX ON analytics.fct_citas (dataset_id, contacto_id);
CREATE INDEX ON analytics.fct_tool_calls (dataset_id, herramienta);
"""


def construir(conn, dataset_id, cfg: dict, claves_payload: list[str]) -> dict[str, int]:
    with conn.cursor() as cur:
        cur.execute("CREATE SCHEMA IF NOT EXISTS analytics")
        cur.execute(DIMENSIONES)
        cur.execute(FCT_TRANSICIONES)
        cur.execute(FCT_CITAS)
        cur.execute(FCT_TOOL_CALLS)
        cur.execute(fct_estadias(cfg))
        cur.execute(fct_touchpoints(cfg, claves_payload))
        cur.execute(fct_leads(conn, dataset_id, cfg))
        cur.execute(INDICES)
        cur.execute("SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema='analytics' ORDER BY 1")
        tablas = [r[0] for r in cur.fetchall()]
        return {t: cur.execute(f'SELECT COUNT(*) FROM analytics."{t}"').fetchone()[0] for t in tablas}
