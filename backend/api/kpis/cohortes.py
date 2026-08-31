"""
Conversión por cohorte de entrada, medida A LA MISMA EDAD.

El KPI con la trampa más cara del dataset. La versión ingenua —ventas finales de
cada mes, una al lado de la otra— no compara conversión: compara cuánto tiempo
lleva abierto cada mes. Con el corte del export en jun 2026, jun 2025 tuvo 350
días para convertir y abr 2026 tuvo 46; la caída que dibuja esa serie es la edad
de las cohortes, no el negocio.

La corrección es la estándar (vintage analysis, "conversión a N días"): todos los
meses se miden dentro de la misma ventana desde la entrada del lead. Medido en
esta base, la serie a 30 días viene SUBIENDO (3,0% en jun 2025 → 5,1% en abr
2026) mientras la de resultado final parecía bajar de 12,3% a 10,6%.
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def cohortes(cur, f: Filtros, ventana_dias: float) -> list[dict]:
    """Conversión por mes de CREACIÓN del lead, dentro de la ventana de observación.

    Devuelve las dos cifras a propósito:

    · `tasa_ventana` — ventas dentro de los primeros `ventana_dias` de cada lead.
      Es LA serie del panel: es la única comparable entre meses.
    · `tasa_conversion` — el resultado final acumulado hasta hoy. Va al globo del
      gráfico y a ningún eje: puesta en una serie invita exactamente a la
      comparación que no se puede hacer.

    `medible` marca si el mes ya cumplió la ventana completa (su ÚLTIMO lead,
    que es la lectura estricta). Un mes que no la cumplió no se dibuja: su cifra
    todavía va a subir.
    """
    w, p = f.where()
    return filas(cur, f"""
        WITH corte AS (
            SELECT MAX(creado_en) AS hasta FROM analytics.fct_leads WHERE dataset_id = %s
        )
        SELECT l.mes,
               COUNT(*)                                        AS leads,
               COUNT(*) FILTER (WHERE l.es_ganado)              AS ganados,
               ROUND(100.0 * AVG(l.es_ganado::int), 2)          AS tasa_conversion,
               -- es_ganado además de la fecha: garantiza que la ventana sea un
               -- subconjunto de las ventas y no una tercera definición de venta
               COUNT(*) FILTER (WHERE l.es_ganado AND l.dias_a_ganado <= %s)
                                                                AS ganados_ventana,
               ROUND(100.0 * COUNT(*) FILTER (WHERE l.es_ganado AND l.dias_a_ganado <= %s)
                     / COUNT(*), 2)                             AS tasa_ventana,
               COUNT(*) FILTER (WHERE NOT l.es_terminal)        AS abiertos,
               -- El mes es comparable cuando a su último lead ya le pasó la
               -- ventana entera. Contra el corte del DATASET y no del filtro: si
               -- el usuario mira sep–dic 2025, esos meses siguen siendo
               -- comparables, porque el tiempo pasó igual.
               (EXTRACT(EPOCH FROM (SELECT hasta FROM corte) - MAX(l.creado_en)) / 86400.0)
                   >= %s                                        AS medible
          FROM analytics.fct_leads l WHERE {w}
         GROUP BY 1 ORDER BY 1""",
                 # el orden es POSICIONAL: los tres %s de la lista de columnas
                 # aparecen antes que el WHERE en el texto de la query
                 [f.dataset_id, ventana_dias, ventana_dias, ventana_dias] + p)
