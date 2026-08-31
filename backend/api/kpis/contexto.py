"""
Contexto del dataset: hasta cuándo llegan los datos y a qué edad se mide un mes
de entrada. No es un KPI de negocio; es lo que el resto necesita para no mentir.
"""
from __future__ import annotations

import config

from .base import filas, uno


def corte(cur, dataset_id: str) -> dict:
    """Fecha de corte del export y ventana de observación de las cohortes.

    La ventana NO se deriva de los datos: es una decisión declarada en
    `config.yml → cohortes.ventana_dias`, porque elegirla es un intercambio
    —medir más de cada mes o poder ver más meses— y eso lo decide una persona.

    Lo que sí se deriva es la medición que la justifica: `p75_dias_a_venta`, el
    plazo dentro del cual ocurren tres de cada cuatro ventas contando desde que
    entró el lead. Está acá para que Metodología pueda mostrar la distancia
    entre la ventana elegida y el largo real del ciclo, en vez de pedir fe.
    """
    ctx = uno(cur, """
        SELECT MAX(creado_en)::date                                     AS corte,
               MIN(creado_en)::date                                     AS inicio,
               -- percentile_cont ignora los NULL: mide solo a los que compraron
               ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY dias_a_ganado)::numeric, 0)
                                                                        AS p75_dias_a_venta
          FROM analytics.fct_leads
         WHERE dataset_id = %s""", [dataset_id])
    ctx["ventana_dias"] = config.ventana_dias()
    return ctx


def opciones(cur, dataset_id: str) -> dict:
    """Valores disponibles para los filtros. Salen de los datos, no de una lista fija."""
    out = {}
    for clave, col in (("canal", "canal"), ("embudo", "embudo"), ("ciudad", "ciudad"),
                       ("tipo_vehiculo", "tipo_vehiculo"), ("mes", "mes")):
        out[clave] = [r[col] for r in filas(
            cur, f"SELECT DISTINCT {col} FROM analytics.fct_leads "
                 f"WHERE dataset_id = %s AND {col} IS NOT NULL ORDER BY 1", [dataset_id])]
    out["vendedores"] = filas(cur, """
        SELECT vendedor_id, nombre FROM analytics.dim_equipo
         WHERE dataset_id = %s ORDER BY nombre""", [dataset_id])
    return out
