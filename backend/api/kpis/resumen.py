"""
Resumen ejecutivo: la fila de arriba del panel.

Es lo único que lee quien tiene treinta segundos, así que cada cifra viene con
el volumen que la sostiene — una tasa sola no se puede accionar.
"""
from __future__ import annotations

from filtros import Filtros

from .base import uno


def resumen(cur, f: Filtros) -> dict:
    w, p = f.where()
    return uno(cur, f"""
        SELECT COUNT(*)                                              AS leads,
               COUNT(*) FILTER (WHERE l.es_ganado)                   AS ganados,
               COUNT(*) FILTER (WHERE l.es_terminal)                 AS cerrados,
               COUNT(*) FILTER (WHERE NOT l.es_terminal)             AS abiertos,
               -- Conversión sobre TODOS los leads, no solo los cerrados: un lead
               -- abandonado que nunca se marcó 'Perdido' es una venta que no
               -- ocurrió. Medir solo sobre cerrados premia no cerrar.
               ROUND(100.0 * AVG(l.es_ganado::int), 2)               AS tasa_conversion,
               ROUND(100.0 * AVG(l.test_drive::int), 2)              AS tasa_test_drive,
               ROUND(100.0 * AVG(l.transferido::int), 2)             AS tasa_transferencia,
               COUNT(*) FILTER (WHERE l.transferido
                                  AND NOT l.respondido_por_humano)   AS handoff_sin_respuesta,
               ROUND(100.0 * AVG((l.transferido
                                  AND NOT l.respondido_por_humano)::int), 2) AS tasa_handoff_perdido,
               ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.dias_en_embudo)::numeric, 1)
                                                                     AS dias_mediana,
               -- El CICLO DE VENTA se mide solo sobre los ganados. La mediana de
               -- todos los leads da 11,2 d contra 25,0 d de los que compran: los
               -- que mueren rápido la arrastran hacia abajo, y publicada como
               -- «cuánto tarda una venta» hace planificar con la mitad del plazo.
               ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.dias_en_embudo)
                     FILTER (WHERE l.es_ganado)::numeric, 1)         AS dias_a_venta,
               ROUND(100.0 * AVG(l.no_show::int), 2)                 AS tasa_no_show
          FROM analytics.fct_leads l WHERE {w}""", p)
