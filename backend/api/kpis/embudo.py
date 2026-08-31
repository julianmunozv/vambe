"""
El embudo y la cartera detenida.

Las dos caras de la misma pregunta: por dónde se caen los leads (pasado) y
quién está esperando una llamada hoy (presente).
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def embudo(cur, f: Filtros) -> list[dict]:
    """Embudo por etapa ALCANZADA, no por etapa actual.

    La diferencia importa: 'cuántos están hoy en Negociación' da 0 porque la
    etapa es de paso. La pregunta del negocio es cuántos LLEGARON, y eso se
    responde con fct_estadias (una fila por ocupación de etapa), no con la
    etapa actual del contacto.
    """
    w, p = f.where()
    # Los días se suman primero por (lead, etapa). Un lead puede reocupar una
    # etapa (60 casos de 109.599) y sin esto entraría dos veces a la mediana:
    # la pregunta es cuánto vive un LEAD en la etapa, no cuánto dura una visita.
    return filas(cur, f"""
        WITH pob AS (SELECT l.contacto_id FROM analytics.fct_leads l WHERE {w}),
        por_lead AS (
            SELECT e.etapa, MIN(e.orden) AS orden, e.contacto_id,
                   SUM(e.dias) AS dias, bool_or(e.es_actual) AS es_actual
              FROM analytics.fct_estadias e
              JOIN pob ON pob.contacto_id = e.contacto_id
             WHERE e.dataset_id = %s AND NOT e.es_terminal
             GROUP BY 1, 3
        )
        SELECT etapa, MIN(orden) AS orden,
               COUNT(*)                                AS alcanzaron,
               COUNT(*) FILTER (WHERE es_actual)       AS estancados_aqui,
               ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY dias)::numeric, 1) AS dias_mediana
          FROM por_lead GROUP BY 1 ORDER BY orden""", p + [f.dataset_id])


def estancados(cur, f: Filtros) -> list[dict]:
    """La lista de trabajo: leads abiertos por etapa y antigüedad.

    Es el KPI que se convierte en acción directa — no describe el pasado, dice
    a quién llamar mañana.
    """
    w, p = f.where()
    return filas(cur, f"""
        WITH pob AS (SELECT l.contacto_id FROM analytics.fct_leads l WHERE {w})
        SELECT e.etapa, MIN(e.orden) AS orden,
               COUNT(*)                                        AS abiertos,
               COUNT(*) FILTER (WHERE e.dias <=  7)            AS d0_7,
               COUNT(*) FILTER (WHERE e.dias >  7 AND e.dias <= 30) AS d8_30,
               COUNT(*) FILTER (WHERE e.dias > 30 AND e.dias <= 90) AS d31_90,
               COUNT(*) FILTER (WHERE e.dias > 90)             AS d90_mas,
               ROUND(MAX(e.dias), 0)                           AS dias_max
          FROM analytics.fct_estadias e
          JOIN pob ON pob.contacto_id = e.contacto_id
         WHERE e.dataset_id = %s AND e.es_actual AND NOT e.es_terminal
         GROUP BY 1 ORDER BY orden""", p + [f.dataset_id])
