"""
Exporta las filas de fct_leads para el ARNÉS DE VERIFICACIÓN.

El panel se sirve SIEMPRE desde el API: esto no viaja al navegador. Lo consume
`npm run verify`, que corre la implementación TypeScript de los KPIs sobre estas
filas y compara sus números contra los del API, caso por caso. Las dos devuelven
el mismo tipo `Dashboard`; si alguna cifra se separa, verify falla.

Antes esto alimentaba un "modo estático" del panel. Se eliminó: publicaba
34.600 filas a nivel de lead al navegador, y su fallback silencioso hacía que un
API caído se viera idéntico a uno sano.

Por qué a nivel de lead y no de agregados: el panel cruza filtros (canal x
embudo x ciudad x mes x vendedor) y un cubo con todas las combinaciones es
inviable. Con las filas de fct_leads el navegador filtra y suma, que es
exactamente lo que hace el API.

Lo importante: acá NO se re-implementa nada de negocio. Toda la lógica
(es_ganado, transferido, qué etapas alcanzó, en qué tramo de SLA cae) se
calcula en SQL y viaja como columna ya derivada. El navegador solo hace
COUNT, AVG y percentil sobre banderas que ya vienen decididas.

    python backend/snapshot/build.py    # escribe backend/snapshot/snapshot.json
"""
from __future__ import annotations
import argparse, json, pathlib, sys

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND / "etl"))
sys.path.insert(0, str(BACKEND / "api"))
import config, db


# Los tramos de SLA se deciden acá, en SQL, junto al resto de la lógica de
# negocio — no en el JS. El front solo agrupa por el índice que recibe.
TRAMOS = ["sin respuesta", "< 1h", "1-4h", "4-24h", "> 24h", "no transferido"]

SQL_LEADS = """
WITH etapas AS (
    -- Un lead puede reocupar una etapa (60 casos de 109.599). Se suman los
    -- días de todas sus ocupaciones: la etapa se "habitó" ese total.
    -- Sin redondear: fct_estadias ya guarda 2 decimales y volver a redondear
    -- acá movía leads de tramo (7,04 días caía en '0-7') y corría las medianas.
    SELECT e.contacto_id, e.orden, SUM(e.dias) AS dias,
           bool_or(e.es_actual) AS es_actual
      FROM analytics.fct_estadias e
     WHERE e.dataset_id = %(ds)s AND NOT e.es_terminal AND e.orden IS NOT NULL
     GROUP BY 1, 2
),
por_lead AS (
    SELECT contacto_id,
           jsonb_object_agg(orden, dias)                    AS dias_etapa,
           MAX(orden) FILTER (WHERE es_actual)              AS etapa_actual_orden
      FROM etapas GROUP BY 1
),
actual AS (
    -- Días de la ocupación EN CURSO. Deliberadamente sin sumar las anteriores:
    -- "hace cuánto que este lead no se mueve" no incluye una visita previa a la
    -- misma etapa. El total por etapa (para la mediana del embudo) va aparte.
    SELECT e.contacto_id, MAX(e.dias) AS dias_etapa_actual
      FROM analytics.fct_estadias e
     WHERE e.dataset_id = %(ds)s AND e.es_actual AND NOT e.es_terminal
       AND e.orden IS NOT NULL
     GROUP BY 1
),
tools AS (
    SELECT contacto_id,
           jsonb_object_agg(herramienta, n)      AS llamadas,
           jsonb_object_agg(herramienta, fallos) AS fallos
      FROM (SELECT contacto_id, herramienta, COUNT(*) n,
                   COUNT(*) FILTER (WHERE NOT exito) fallos
              FROM analytics.fct_tool_calls WHERE dataset_id = %(ds)s
             GROUP BY 1, 2) x
     GROUP BY 1
),
venta AS (
    SELECT l.contacto_id, MIN(e.entro_en) AS ganado_en
      FROM analytics.fct_leads l
      JOIN analytics.fct_estadias e
        ON e.dataset_id = l.dataset_id
       AND e.contacto_id = l.contacto_id
       AND e.etapa = l.etapa_actual
     WHERE l.dataset_id = %(ds)s AND l.es_ganado
     GROUP BY 1
)
SELECT l.canal, l.embudo, l.ciudad, l.tipo_vehiculo, l.mes, l.vendedor_id,
       l.campana, l.platform, l.objetivo, l.modelo_interes, l.forma_pago,
       l.origen_detalle,
       l.es_ganado, l.es_terminal, l.test_drive, l.no_show,
       -- La venta DENTRO de la ventana de observación se decide acá, en SQL,
       -- igual que el tramo de SLA: el front no puede tener su propia idea de
       -- cuándo una venta cuenta para el mes en que entró el lead.
       COALESCE(l.es_ganado AND l.dias_a_ganado <= %(ventana)s, false) AS gano_en_ventana,
       l.transferido, l.respondido_por_humano,
       -- tramo de SLA: decidido en SQL, igual que en kpis.handoff
       CASE WHEN NOT l.transferido            THEN 5
            WHEN NOT l.respondido_por_humano  THEN 0
            WHEN l.horas_a_respuesta <  1     THEN 1
            WHEN l.horas_a_respuesta <  4     THEN 2
            WHEN l.horas_a_respuesta < 24     THEN 3
            ELSE                                   4 END       AS tramo_sla,
       l.dias_en_embudo, l.n_mensajes, to_char(v.ganado_en, 'YYYY-MM') AS mes_ganado,
       (l.creado_en::date - (SELECT MIN(creado_en)::date
                               FROM analytics.fct_leads WHERE dataset_id = %(ds)s)) AS dia,
       pl.dias_etapa, pl.etapa_actual_orden, ac.dias_etapa_actual,
       t.llamadas, t.fallos
  FROM analytics.fct_leads l
  LEFT JOIN por_lead pl ON pl.contacto_id = l.contacto_id
  LEFT JOIN actual   ac ON ac.contacto_id = l.contacto_id
  LEFT JOIN tools    t  ON t.contacto_id  = l.contacto_id
  LEFT JOIN venta    v  ON v.contacto_id  = l.contacto_id
 WHERE l.dataset_id = %(ds)s
 ORDER BY l.contacto_id
"""


class Diccionario:
    """Texto → índice. Ahorra repetir 34.600 veces 'Ventas Autos Nuevos'."""

    def __init__(self) -> None:
        self.valores: list[str] = []
        self._idx: dict[str, int] = {}

    def __call__(self, v) -> int:
        if v is None:
            return -1
        if v not in self._idx:
            self._idx[v] = len(self.valores)
            self.valores.append(v)
        return self._idx[v]


def construir(dataset_id: str | None = None) -> dict:
    with db.conectar() as conn, conn.cursor() as cur:
        if not dataset_id:
            cur.execute("SELECT id FROM control.datasets WHERE estado='listo' "
                        "ORDER BY subido_en DESC LIMIT 1")
            fila = cur.fetchone()
            if not fila:
                raise SystemExit("no hay dataset en estado 'listo'")
            dataset_id = str(fila[0])

        import kpis
        contexto = kpis.corte(cur, dataset_id)
        cur.execute("SELECT MAX(creado_en)::date - MIN(creado_en)::date "
                    "FROM analytics.fct_leads WHERE dataset_id=%s", (dataset_id,))
        contexto["dia_corte"] = cur.fetchone()[0]
        cur.execute("SELECT DISTINCT herramienta FROM analytics.fct_tool_calls "
                    "WHERE dataset_id=%s ORDER BY 1", (dataset_id,))
        herramientas = [r[0] for r in cur.fetchall()]
        cur.execute("SELECT vendedor_id, nombre FROM analytics.dim_equipo "
                    "WHERE dataset_id=%s", (dataset_id,))
        nombres = dict(cur.fetchall())
        cur.execute("SELECT etapa, MIN(orden) FROM analytics.fct_estadias "
                    "WHERE dataset_id=%s AND NOT es_terminal AND orden IS NOT NULL "
                    "GROUP BY 1 ORDER BY 2", (dataset_id,))
        etapas = [e for e, _ in cur.fetchall()]

        cur.execute(SQL_LEADS, {"ds": dataset_id, "ventana": contexto["ventana_dias"]})
        cols = [d[0] for d in cur.description]
        filas = cur.fetchall()

    d = {k: Diccionario() for k in
         ("canal", "embudo", "ciudad", "tipo_vehiculo", "mes", "vendedor",
          "campana", "platform", "objetivo", "modelo", "forma_pago", "origen")}
    n_et, n_h = len(etapas), len(herramientas)
    # columnar: una lista por campo. Comprime mucho mejor que 34.600 objetos.
    col: dict[str, list] = {k: [] for k in
        ("ca", "em", "ci", "tv", "me", "ve", "cp", "pl", "ob", "mo", "fp", "og",
         "g", "gv", "t", "td", "ns", "tr", "rh", "sla", "dias", "nmsg", "dia", "mg", "eact", "dact")}
    det = [[] for _ in range(n_et)]      # días en cada etapa (-1 = no la alcanzó)
    tl  = [[] for _ in range(n_h)]       # llamadas por herramienta
    tf  = [[] for _ in range(n_h)]       # fallos por herramienta

    for f in filas:
        r = dict(zip(cols, f))
        col["ca"].append(d["canal"](r["canal"]))
        col["em"].append(d["embudo"](r["embudo"]))
        col["ci"].append(d["ciudad"](r["ciudad"]))
        col["tv"].append(d["tipo_vehiculo"](r["tipo_vehiculo"]))
        col["me"].append(d["mes"](r["mes"]))
        col["mg"].append(d["mes"](r["mes_ganado"]))
        col["ve"].append(d["vendedor"](nombres.get(r["vendedor_id"])))
        col["cp"].append(d["campana"](r["campana"]))
        col["pl"].append(d["platform"](r["platform"]))
        col["ob"].append(d["objetivo"](r["objetivo"]))
        col["mo"].append(d["modelo"](r["modelo_interes"]))
        col["fp"].append(d["forma_pago"](r["forma_pago"]))
        col["og"].append(d["origen"](r["origen_detalle"]))
        for clave, campo in (("g", "es_ganado"), ("gv", "gano_en_ventana"),
                             ("t", "es_terminal"), ("td", "test_drive"),
                             ("ns", "no_show"), ("tr", "transferido"),
                             ("rh", "respondido_por_humano")):
            col[clave].append(1 if r[campo] else 0)
        col["sla"].append(r["tramo_sla"])
        col["dias"].append(-1 if r["dias_en_embudo"] is None else float(r["dias_en_embudo"]))
        col["nmsg"].append(int(r["n_mensajes"] or 0))
        col["dia"].append(int(r["dia"]))
        col["eact"].append(int(r["etapa_actual_orden"] or 0))
        col["dact"].append(-1 if r["dias_etapa_actual"] is None else float(r["dias_etapa_actual"]))

        de = r["dias_etapa"] or {}
        for i in range(n_et):
            v = de.get(str(i + 1))
            det[i].append(-1 if v is None else float(v))
        llam, fall = r["llamadas"] or {}, r["fallos"] or {}
        for i, h in enumerate(herramientas):
            tl[i].append(int(llam.get(h, 0)))
            tf[i].append(int(fall.get(h, 0)))

    return {
        "dataset_id": dataset_id,
        "contexto": {k: (str(v) if hasattr(v, "isoformat") else
                         float(v) if hasattr(v, "as_tuple") else v)
                     for k, v in contexto.items()},
        "n": len(filas),
        "dic": {k: v.valores for k, v in d.items()},
        "etapas": etapas,
        "herramientas": herramientas,
        "tramos": TRAMOS,
        "col": col,
        "dias_etapa": det,
        "tool_llamadas": tl,
        "tool_fallos": tf,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset")
    ap.add_argument("--salida", default=str(BACKEND / "snapshot" / "snapshot.json"))
    args = ap.parse_args()

    snap = construir(args.dataset)
    destino = pathlib.Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    # JSON puro: lo carga el navegador con fetch y lo carga Node en el verify.
    # Como archivo aparte (y no incrustado en el bundle) queda cacheable y no
    # obliga a reconstruir el JS cuando cambian los datos.
    cuerpo = json.dumps(snap, separators=(",", ":"), ensure_ascii=False)
    destino.write_text(cuerpo, encoding="utf-8")
    print(f"{destino}  ·  {len(cuerpo):,} bytes  ·  {snap['n']:,} leads")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
