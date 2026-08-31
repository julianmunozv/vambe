"""
El asistente: el traspaso a un humano y las herramientas que ejecuta.

Es donde la operación se rompe, y donde más fácil se confunde correlación con
causa. Cada función dice cuál de las dos está midiendo.
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def handoff(cur, f: Filtros) -> list[dict]:
    """El traspaso IA → humano, que es donde la operación se rompe.

    Los tramos de SLA salen casi planos entre sí (11,5% a <1h vs 11,3% a >24h):
    lo que mueve la aguja no es la VELOCIDAD de la respuesta sino su EXISTENCIA.
    Por eso 'sin respuesta' es una categoría propia y no un tramo más.
    """
    w, p = f.where()
    # El tramo se calcula una vez en un CTE: Postgres no acepta un alias de
    # salida dentro de un CASE en el ORDER BY, y repetir el CASE entero en el
    # GROUP BY y en el ORDER BY es donde se cuelan las inconsistencias.
    #
    # Este mismo CASE está replicado en backend/snapshot/build.py, que lo
    # congela como columna para el modo estático. Si cambia un corte, cambia en
    # los dos y `npm run verify` avisa si no.
    return filas(cur, f"""
        WITH clasificado AS (
            SELECT l.es_ganado,
                   CASE WHEN NOT l.transferido            THEN 'no transferido'
                        WHEN NOT l.respondido_por_humano  THEN 'sin respuesta'
                        WHEN l.horas_a_respuesta <  1     THEN '< 1h'
                        WHEN l.horas_a_respuesta <  4     THEN '1-4h'
                        WHEN l.horas_a_respuesta < 24     THEN '4-24h'
                        ELSE                                   '> 24h' END AS tramo,
                   CASE WHEN NOT l.transferido            THEN 5
                        WHEN NOT l.respondido_por_humano  THEN 0
                        WHEN l.horas_a_respuesta <  1     THEN 1
                        WHEN l.horas_a_respuesta <  4     THEN 2
                        WHEN l.horas_a_respuesta < 24     THEN 3
                        ELSE                                   4 END AS orden
              FROM analytics.fct_leads l WHERE {w}
        )
        SELECT tramo, orden,
               COUNT(*)                                        AS leads,
               COUNT(*) FILTER (WHERE es_ganado)                AS ganados,
               ROUND(100.0 * AVG(es_ganado::int), 2)            AS tasa_conversion
          FROM clasificado GROUP BY 1, 2 ORDER BY orden""", p)


def herramientas(cur, f: Filtros) -> list[dict]:
    """Uso y fallo de las herramientas del asistente.

    La tasa de fallo es causal y accionable (una herramienta que falla es un
    bug). El diferencial de conversión NO lo es: agendar_test_drive 'convierte'
    porque agendar un test drive ES avanzar en el embudo. Se reporta como
    correlación etiquetada, no como impacto.
    """
    w, p = f.where()
    return filas(cur, f"""
        WITH pob AS (SELECT l.contacto_id, l.es_ganado FROM analytics.fct_leads l WHERE {w})
        SELECT tc.herramienta,
               COUNT(*)                                              AS llamadas,
               COUNT(DISTINCT tc.contacto_id)                        AS leads_tocados,
               ROUND(100.0 * AVG((NOT tc.exito)::int), 2)            AS tasa_fallo,
               ROUND(100.0 * AVG(pob.es_ganado::int), 2)             AS conversion_de_tocados
          FROM analytics.fct_tool_calls tc
          JOIN pob ON pob.contacto_id = tc.contacto_id
         WHERE tc.dataset_id = %s
         GROUP BY 1 ORDER BY llamadas DESC""", p + [f.dataset_id])
