"""Ventas cerradas por mes calendario.

No es una cohorte de entrada: cada venta cae en el mes en que el lead alcanzó
la etapa ganada. Esa diferencia es la que permite leer el resultado comercial
mensual sin una ventana de observación.
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def ventas_mes(cur, f: Filtros) -> list[dict]:
    """Cantidad de leads ganados, agrupados por el mes en que se ganaron."""
    w, p = f.where()
    return filas(cur, f"""
        WITH fecha_venta AS (
            SELECT l.dataset_id, l.contacto_id, MIN(e.entro_en) AS vendido_en
              FROM analytics.fct_leads l
              JOIN analytics.fct_estadias e
                ON e.dataset_id = l.dataset_id
               AND e.contacto_id = l.contacto_id
               AND e.etapa = l.etapa_actual
             WHERE l.dataset_id = %s AND l.es_ganado
             GROUP BY 1, 2
        )
        SELECT to_char(v.vendido_en, 'YYYY-MM') AS mes,
               COUNT(*)                        AS ventas
          FROM analytics.fct_leads l
          JOIN fecha_venta v
            ON v.dataset_id = l.dataset_id AND v.contacto_id = l.contacto_id
         WHERE {w}
         GROUP BY 1 ORDER BY 1""", [f.dataset_id] + p)
