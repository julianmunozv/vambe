"""
API del dashboard.

Sirve JSON agregado desde analytics.*. Ni una sola métrica se calcula en el
navegador: el front pinta lo que el API le da, así que el número que ve la
gerencia y el que produce una query de auditoría son el mismo número.

    uvicorn main:app --app-dir api --reload
"""
from __future__ import annotations
import pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "etl"))


from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import db
import kpis
from filtros import Filtros

BACKEND = pathlib.Path(__file__).resolve().parent.parent
RAIZ = BACKEND.parent
# El build de Vite. Si no existe, el API funciona igual: en desarrollo el panel
# lo sirve `npm run dev` y pega contra este mismo origen vía proxy.
WEB = RAIZ / "frontend" / "dist"

app = FastAPI(title="Vambe Motors · Analytics", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def preparar() -> None:
    """DDL idempotente de las tablas de control. El resto lo crea el ETL."""
    with db.conectar(autocommit=True) as conn, conn.cursor() as cur:
        cur.execute((BACKEND / "api" / "schema.sql").read_text())


def _dataset_por_defecto(cur) -> str:
    """El dataset listo más reciente. Evita que el front tenga que saber el id."""
    cur.execute("SELECT id FROM control.datasets WHERE estado = 'listo' "
                "ORDER BY subido_en DESC LIMIT 1")
    fila = cur.fetchone()
    if not fila:
        raise HTTPException(503, "no hay ningún dataset procesado todavía")
    return str(fila[0])


def _filtros(dataset_id, canal, embudo, ciudad, vendedor_id, tipo_vehiculo, desde, hasta, cur):
    return Filtros(
        dataset_id=dataset_id or _dataset_por_defecto(cur),
        canal=canal or [], embudo=embudo or [], ciudad=ciudad or [],
        vendedor_id=vendedor_id or [], tipo_vehiculo=tipo_vehiculo or [],
        desde=desde, hasta=hasta)


# Todos los endpoints comparten esta firma: un solo juego de filtros para todo
# el dashboard, así dos tarjetas nunca miran poblaciones distintas.
def _params(
    dataset_id: str | None = Query(None),
    canal: list[str] | None = Query(None),
    embudo: list[str] | None = Query(None),
    ciudad: list[str] | None = Query(None),
    vendedor_id: list[int] | None = Query(None),
    tipo_vehiculo: list[str] | None = Query(None),
    desde: str | None = Query(None, description="mes inclusive, YYYY-MM"),
    hasta: str | None = Query(None, description="mes inclusive, YYYY-MM"),
):
    return dict(dataset_id=dataset_id, canal=canal, embudo=embudo, ciudad=ciudad,
                vendedor_id=vendedor_id, tipo_vehiculo=tipo_vehiculo,
                desde=desde, hasta=hasta)


from fastapi import Depends


@app.get("/api/datasets")
def datasets():
    with db.conectar() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, archivo, estado, subido_en, filas_origen "
                    "FROM control.datasets ORDER BY subido_en DESC")
        return [dict(id=str(a), archivo=b, estado=c, subido_en=d, filas_origen=e)
                for a, b, c, d, e in cur.fetchall()]


@app.get("/api/contexto")
def contexto(p: dict = Depends(_params)):
    """Todo lo que el front necesita para arrancar: dataset, corte y filtros."""
    with db.conectar() as conn, conn.cursor() as cur:
        ds = p["dataset_id"] or _dataset_por_defecto(cur)
        return {"dataset_id": ds, **kpis.corte(cur, ds), "opciones": kpis.opciones(cur, ds)}


@app.get("/api/perfil")
def perfil(dataset_id: str | None = None):
    """El reporte de perfilado: qué descartó el pipeline y por qué.

    Se expone a propósito. Un dashboard que dice 'limpiamos los datos' sin
    mostrar qué sacó pide un acto de fe; esto lo hace auditable.
    """
    with db.conectar() as conn, conn.cursor() as cur:
        ds = dataset_id or _dataset_por_defecto(cur)
        cur.execute("SELECT perfil FROM control.datasets WHERE id = %s", (ds,))
        fila = cur.fetchone()
        if not fila or fila[0] is None:
            raise HTTPException(404, "ese dataset no tiene perfilado")
        return fila[0]


def _con_filtros(p: dict, fn, **extra):
    with db.conectar() as conn, conn.cursor() as cur:
        f = _filtros(cur=cur, **p)
        return fn(cur, f, **extra)


@app.get("/api/resumen")
def resumen(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.resumen)


@app.get("/api/ventas-mes")
def ventas_mes(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.ventas_mes)


@app.get("/api/canales")
def canales(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.canales)


@app.get("/api/campanas")
def campanas(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.campanas)


@app.get("/api/origenes")
def origenes(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.origenes)


@app.get("/api/canales-mes")
def canales_mes(p: dict = Depends(_params)):
    """La serie mensual por canal. Comparte la ventana de observación con
    /api/cohortes para que las dos series midan lo mismo y se corten en el mismo
    mes."""
    with db.conectar() as conn, conn.cursor() as cur:
        f = _filtros(cur=cur, **p)
        return kpis.canales_mes(cur, f, float(kpis.corte(cur, f.dataset_id)["ventana_dias"]))


@app.get("/api/embudo")
def embudo(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.embudo)


@app.get("/api/estancados")
def estancados(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.estancados)


@app.get("/api/cohortes")
def cohortes(p: dict = Depends(_params)):
    with db.conectar() as conn, conn.cursor() as cur:
        f = _filtros(cur=cur, **p)
        return kpis.cohortes(cur, f, float(kpis.corte(cur, f.dataset_id)["ventana_dias"]))


@app.get("/api/handoff")
def handoff(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.handoff)


@app.get("/api/herramientas")
def herramientas(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.herramientas)


@app.get("/api/vendedores")
def vendedores(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.vendedores)


@app.get("/api/demanda")
def demanda(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.demanda)


@app.get("/api/no-show")
def no_show(p: dict = Depends(_params)):
    return _con_filtros(p, kpis.no_show)


@app.get("/api/todo")
def todo(p: dict = Depends(_params)):
    """Todo el panel en una respuesta.

    La lista de secciones NO está acá: vive en `kpis.SECCIONES`, junto a las
    queries. Agregar un KPI al panel es agregar una línea allá, no tocar este
    archivo.

    La forma de esta respuesta es el tipo `Dashboard` del front, y la otra
    implementación del mismo tipo es el snapshot estático. Por eso campanas,
    demanda y no_show quedan en sus propios endpoints y no acá: son cortes de
    apoyo que el panel no dibuja —`origenes` ya contiene a las campañas, con su
    nombre en vez del id de Meta— y meterlos obligaría al snapshot a calcularlos
    para nada.
    """
    with db.conectar() as conn, conn.cursor() as cur:
        return kpis.panel(cur, _filtros(cur=cur, **p))


# El build del panel se sirve desde el mismo origen: en producción no hay CORS.
# Va montado en "/" y al final del archivo, para que no tape las rutas /api/*.
if WEB.exists():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
