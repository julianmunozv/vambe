"""
Adquisición: de dónde vienen los leads y cuáles valen la pena.

La pregunta #1 de la gerencia, y la que más fácil se contesta mal: la tasa sola
sin el volumen al lado hace que un canal de 300 leads parezca la estrategia.

Cuatro cortes de la misma pregunta, de menos a más fino:

    canales      el agregado del período, cuatro filas
    canales_mes  el mismo corte MES A MES — sin esto no se ve que el canal
                 pagado cayó de 7,2% a 1,5% mientras subía el volumen
    origenes     el canal abierto por su fuente concreta, que es donde vive la
                 diferencia de 2x adentro de un mismo canal
    campanas     solo el canal pagado; lo subsume `origenes` y queda como
                 endpoint suelto
"""
from __future__ import annotations

from filtros import Filtros

from .base import filas


def canales(cur, f: Filtros) -> list[dict]:
    """Qué canal vale la pena.

    Va con volumen al lado de la tasa a propósito: un canal con 25% de
    conversión y 300 leads no es comparable con uno de 4,5% y 15.000.
    """
    w, p = f.where()
    return filas(cur, f"""
        SELECT l.canal,
               COUNT(*)                                        AS leads,
               COUNT(*) FILTER (WHERE l.es_ganado)              AS ganados,
               ROUND(100.0 * AVG(l.es_ganado::int), 2)          AS tasa_conversion,
               ROUND(100.0 * AVG(l.test_drive::int), 2)         AS tasa_test_drive,
               ROUND(AVG(l.dias_en_embudo), 1)                  AS dias_promedio,
               ROUND(AVG(l.n_mensajes), 1)                      AS mensajes_promedio
          FROM analytics.fct_leads l WHERE {w}
         GROUP BY 1 ORDER BY leads DESC""", p)


def campanas(cur, f: Filtros) -> list[dict]:
    """Desagrega el canal pagado. 'Los ads convierten mal' no es accionable;
    'la campaña lookalike trae el 50% del volumen pagado al 3,8%' sí lo es."""
    w, p = f.where()
    return filas(cur, f"""
        SELECT l.platform, l.campana, l.objetivo,
               COUNT(*)                                        AS leads,
               COUNT(*) FILTER (WHERE l.es_ganado)              AS ganados,
               ROUND(100.0 * AVG(l.es_ganado::int), 2)          AS tasa_conversion,
               ROUND(100.0 * AVG(l.test_drive::int), 2)         AS tasa_test_drive
          FROM analytics.fct_leads l
         WHERE {w} AND l.campana IS NOT NULL
         GROUP BY 1, 2, 3 ORDER BY leads DESC""", p)


def canales_mes(cur, f: Filtros, ventana_dias: float) -> list[dict]:
    """La serie mensual de cada canal: volumen y conversión, mes a mes.

    Es la pregunta de presupuesto que el agregado no puede contestar. `canales`
    dice que el canal pagado convierte al 4,5%; esto dice que venía del 7,2% y
    terminó en 1,5% mientras subía el volumen. Un promedio de doce meses esconde
    exactamente el movimiento sobre el que se decide.

    La ventana de observación es la MISMA de `cohortes` y por la misma razón: el
    resultado final de un mes reciente está incompleto, así que las cuatro líneas
    terminan en un derrumbe que solo mide la edad de las cohortes. Acá se cuenta
    la venta que ocurrió dentro de los primeros `ventana_dias` del lead, que es
    la única cifra que se puede poner al lado de la de otro mes.

    `medible` se decide por MES y no por mes×canal a propósito: así las líneas de
    todos los canales se cortan en el mismo punto. Con un corte por canal, el
    límite de cada línea dependería de a qué hora entró su último lead — mismo
    dato, cuatro cortes distintos y ninguno explicable.
    """
    w, p = f.where()
    return filas(cur, f"""
        WITH corte AS (
            SELECT MAX(creado_en) AS hasta FROM analytics.fct_leads WHERE dataset_id = %s
        ),
        pob AS (
            SELECT l.mes, l.canal, l.es_ganado, l.creado_en,
                   -- COALESCE: sin él un NULL entraría al AVG como fila
                   -- descartada y encogería el denominador en silencio
                   COALESCE(l.es_ganado AND l.dias_a_ganado <= %s, false) AS en_ventana
              FROM analytics.fct_leads l WHERE {w}
        ),
        edad AS (
            SELECT mes,
                   (EXTRACT(EPOCH FROM (SELECT hasta FROM corte) - MAX(creado_en)) / 86400.0)
                       >= %s                                   AS medible
              FROM pob GROUP BY 1
        )
        SELECT p.mes, p.canal,
               COUNT(*)                                        AS leads,
               COUNT(*) FILTER (WHERE p.es_ganado)              AS ganados,
               ROUND(100.0 * AVG(p.es_ganado::int), 2)          AS tasa_conversion,
               COUNT(*) FILTER (WHERE p.en_ventana)             AS ganados_ventana,
               ROUND(100.0 * AVG(p.en_ventana::int), 2)         AS tasa_ventana,
               e.medible
          FROM pob p JOIN edad e USING (mes)
         GROUP BY 1, 2, 8 ORDER BY 1, 2""",
                 [f.dataset_id, ventana_dias] + p + [ventana_dias])


def origenes(cur, f: Filtros) -> list[dict]:
    """El canal, abierto por el origen concreto del lead.

    `canal` es la categoría contable —pagado, orgánico, formulario, outbound— y
    adentro de cada una hay fuentes que no se parecen en nada: en orgánico, el
    link de WhatsApp convierte al 34,1% y el botón del sitio al 17,2%, y el
    promedio del canal (24,7%) no describe a ninguno de los dos. Repartir
    presupuesto sobre ese promedio es repartirlo entre una fuente que rinde el
    doble que la otra como si rindieran igual.

    `rotulo` es el nombre de la campaña cuando el origen es un aviso pagado —el
    id numérico de Meta no le dice nada a nadie— y el slug del origen en el
    resto. Con eso esta query subsume a `campanas`: los tres orígenes del canal
    pagado SON las tres campañas, y dibujarlas en una tabla aparte contaba lo
    mismo dos veces. `campanas` sigue existiendo como endpoint suelto.
    """
    w, p = f.where()
    return filas(cur, f"""
        SELECT l.canal,
               l.origen_detalle                                AS origen,
               COALESCE(l.campana, l.origen_detalle)            AS rotulo,
               COUNT(*)                                        AS leads,
               COUNT(*) FILTER (WHERE l.es_ganado)              AS ganados,
               ROUND(100.0 * AVG(l.es_ganado::int), 2)          AS tasa_conversion,
               ROUND(100.0 * AVG(l.test_drive::int), 2)         AS tasa_test_drive,
               ROUND(AVG(l.dias_en_embudo), 1)                  AS dias_promedio,
               ROUND(AVG(l.n_mensajes), 1)                      AS mensajes_promedio
          FROM analytics.fct_leads l
         WHERE {w} AND l.origen_detalle IS NOT NULL
         GROUP BY 1, 2, 3 ORDER BY leads DESC""", p)
