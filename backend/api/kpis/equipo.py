"""
Rendimiento del equipo comercial.

El KPI más peligroso del panel: publicado mal, premia el ruteo de leads en vez
del desempeño. Por eso la tasa cruda viaja acompañada de su confusor.

La fila trae tres cosas distintas de cada persona, y esa es la pregunta del
segmento —a quién le pido qué— desarmada en sus partes:

    cierra    tasa_cruda / tasa_en_pagado   qué tan bien vende
    responde  escalados / sin_respuesta     si contesta lo que la IA le pasa
    sostiene  abiertos / detenidos          con qué cartera se quedó

Sin las dos últimas, «a quién le pido qué» se contestaba solo con la tasa de
cierre, que es justo la cifra que menos depende de la persona.
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def vendedores(cur, f: Filtros) -> list[dict]:
    """Rendimiento del equipo, con el confusor a la vista.

    La conversión cruda de un vendedor mide sobre todo QUÉ LEADS LE TOCARON: el
    de mejor número tiene 33,8% de leads orgánicos contra ~7% del resto. Por eso
    la columna que manda es la conversión DENTRO del canal pagado, donde todos
    reciben el mismo tipo de lead. Publicar solo la cruda haría que la gerencia
    premie el ruteo y castigue a quien recibe el peor inventario de leads.

    Por lo mismo el ORDER BY es por la tasa comparable y no por la cruda: el
    orden de una tabla ES un ranking para quien la lee, y ordenarla por la cifra
    que el propio módulo desaconseja publicaba el espejismo como veredicto.
    El desempate por nombre no es decorativo — sin él, dos vendedores con la
    misma tasa salen en el orden que quiera el planificador y la comparación
    contra el gemelo en TypeScript falla de forma intermitente.
    """
    w, p = f.where()
    # `parado` es la MISMA definición de cartera detenida que usa kpis.estancados:
    # días de la ocupación en curso, sin sumar visitas anteriores a la etapa. Se
    # agrupa por contacto (y no se toma la fila suelta) para que un lead cuente
    # una sola vez aunque el modelado le deje más de una estadía marcada.
    return filas(cur, f"""
        WITH parado AS (
            SELECT e.contacto_id, MAX(e.dias) AS dias
              FROM analytics.fct_estadias e
             WHERE e.dataset_id = %s AND e.es_actual AND NOT e.es_terminal
               AND e.orden IS NOT NULL
             GROUP BY 1
        )
        SELECT eq.vendedor_id, eq.nombre, eq.rol,
               COUNT(*)                                              AS leads,
               COUNT(*) FILTER (WHERE l.es_ganado)                    AS ganados,
               ROUND(100.0 * AVG(l.es_ganado::int), 2)               AS tasa_cruda,
               ROUND(100.0 * AVG(l.es_ganado::int)
                     FILTER (WHERE l.canal = 'ad'), 2)               AS tasa_en_pagado,
               COUNT(*) FILTER (WHERE l.canal = 'ad')                AS leads_pagado,
               ROUND(100.0 * AVG((l.canal = 'organico')::int), 2)    AS pct_organico,
               ROUND(100.0 * AVG(l.no_show::int), 2)                 AS tasa_no_show,
               -- lo que la IA le pasó y lo que hizo con eso
               COUNT(*) FILTER (WHERE l.transferido)                 AS escalados,
               COUNT(*) FILTER (WHERE l.transferido
                                  AND NOT l.respondido_por_humano)   AS sin_respuesta,
               ROUND(100.0 * AVG((NOT l.respondido_por_humano)::int)
                     FILTER (WHERE l.transferido), 2)                AS tasa_sin_respuesta,
               -- la cartera que quedó en sus manos
               COUNT(*) FILTER (WHERE NOT l.es_terminal)             AS abiertos,
               COUNT(*) FILTER (WHERE NOT l.es_terminal
                                  AND pa.dias > 90)                  AS detenidos
          FROM analytics.fct_leads l
          JOIN analytics.dim_equipo eq
            ON eq.dataset_id = l.dataset_id AND eq.vendedor_id = l.vendedor_id
          LEFT JOIN parado pa ON pa.contacto_id = l.contacto_id
         WHERE {w}
         GROUP BY 1, 2, 3
         ORDER BY tasa_en_pagado DESC NULLS LAST, eq.nombre""", [f.dataset_id] + p)
