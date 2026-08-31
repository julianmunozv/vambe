"""
EL ÍNDICE DE KPIs. Si buscás dónde se calcula un número, empezá acá.

Un KPI = una función = una query legible. Cada familia vive en su propio módulo
y el mapa de abajo dice cuál:

    resumen      resumen.py   la fila de arriba del panel
    ventas_mes   ventas.py    ventas cerradas en cada mes calendario
    canales      canales.py   de dónde vienen los leads
    canales_mes  canales.py   los mismos canales, mes a mes
    origenes     canales.py   el canal abierto por su fuente concreta
    embudo       embudo.py    por dónde se caen
    estancados   embudo.py    quién está esperando hoy
    cohortes     cohortes.py  conversión por mes de entrada, medida a la misma edad
    handoff      ia.py        el traspaso IA → vendedor
    vendedores   equipo.py    el equipo, con su confusor a la vista
    campanas     canales.py   el canal pagado, desagregado    (fuera del panel)
    herramientas ia.py        uso y fallo de las tools        (fuera del panel)
    demanda      demanda.py   qué modelo pide el mercado      (fuera del panel)
    no_show      demanda.py   citas que no se presentaron     (fuera del panel)
    corte        contexto.py  hasta cuándo llegan los datos
    opciones     contexto.py  valores disponibles para los filtros

Cada uno de esos nombres tiene un gemelo en TypeScript con el MISMO nombre de
archivo bajo `frontend/src/kpis/`, para que el panel pueda correr sin backend.
Tocar uno sin el otro lo detecta `npm run verify`.

REGLA DURA: los leads se cuentan SOLO desde fct_leads (1 fila = 1 lead). Contar
desde una tabla de grano más fino infla los totales — contar payloads en vez de
leads infla el canal orgánico un 20,3%.

Todas las funciones filtran por el mismo WHERE (filtros.py), así que dos
tarjetas del dashboard nunca están mirando poblaciones distintas.
"""
from __future__ import annotations

from filtros import Filtros

from .canales import campanas, canales, canales_mes, origenes
from .cohortes import cohortes
from .contexto import corte, opciones
from .demanda import demanda, no_show
from .embudo import embudo, estancados
from .equipo import vendedores
from .ia import handoff, herramientas
from .resumen import resumen
from .ventas import ventas_mes

__all__ = [
    "campanas", "canales", "canales_mes", "cohortes", "corte", "demanda", "embudo",
    "estancados", "handoff", "herramientas", "no_show", "opciones", "origenes", "panel",
    "resumen", "vendedores", "ventas_mes",
]


# Las secciones que dibuja el panel, en un solo lugar. Es la lista que tiene que
# calzar con el tipo `Dashboard` del front y con `frontend/src/kpis/index.ts`:
# agregar una sección es agregar una línea acá, no editar tres archivos.
SECCIONES = (
    ("resumen", resumen),
    ("ventas_mes", ventas_mes),
    ("canales", canales),
    ("origenes", origenes),
    ("embudo", embudo),
    ("estancados", estancados),
    ("handoff", handoff),
    ("vendedores", vendedores),
)


def panel(cur, f: Filtros) -> dict:
    """El panel completo en una sola conexión y un solo juego de filtros.

    Hacerlo con un round-trip por sección serían N conexiones y N WHERE que
    podrían desincronizarse.
    """
    ctx = corte(cur, f.dataset_id)
    salida = {"dataset_id": f.dataset_id, "contexto": ctx}
    salida.update({clave: fn(cur, f) for clave, fn in SECCIONES})
    # Las dos series mensuales necesitan un parámetro extra: la ventana de
    # observación sale del contexto, no de una constante. Es la MISMA para las
    # dos, y eso es lo que hace que midan lo mismo y se corten en el mismo mes.
    ventana = float(ctx["ventana_dias"])
    salida["cohortes"] = cohortes(cur, f, ventana)
    salida["canales_mes"] = canales_mes(cur, f, ventana)
    return salida
