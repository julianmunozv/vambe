"""
Cortes de apoyo: qué pide el mercado y dónde se caen las citas.

No los dibuja el panel — viven en sus propios endpoints. Están acá porque son
la respuesta a preguntas que la gerencia hace en la reunión siguiente.
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def demanda(cur, f: Filtros) -> list[dict]:
    """Qué pide el mercado: modelo, presupuesto y forma de pago del lead.

    Sale de la metadata del contacto (EAV pivoteado en stg.metadata). Es lo que
    conecta el embudo con la decisión de inventario.
    """
    w, p = f.where()
    return filas(cur, f"""
        SELECT l.tipo_vehiculo, l.modelo_interes, l.forma_pago,
               COUNT(*)                                        AS leads,
               ROUND(100.0 * AVG(l.es_ganado::int), 2)          AS tasa_conversion
          FROM analytics.fct_leads l
         WHERE {w} AND l.modelo_interes IS NOT NULL
         GROUP BY 1, 2, 3 ORDER BY leads DESC""", p)


def no_show(cur, f: Filtros) -> list[dict]:
    """No-show por tipo de cita y sucursal."""
    w, p = f.where()
    return filas(cur, f"""
        WITH pob AS (SELECT l.contacto_id FROM analytics.fct_leads l WHERE {w})
        SELECT c.sucursal, c.tipo,
               COUNT(*)                                        AS citas,
               ROUND(100.0 * AVG(c.es_no_show::int), 2)         AS tasa_no_show
          FROM analytics.fct_citas c
          JOIN pob ON pob.contacto_id = c.contacto_id
         WHERE c.dataset_id = %s
         GROUP BY 1, 2 ORDER BY citas DESC""", p + [f.dataset_id])
