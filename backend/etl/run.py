"""
CLI del pipeline.

    python etl/run.py --source data/raw/vambe_concesionaria.db
    python etl/run.py --dataset <id> --desde perfilado --source <db>
    python etl/run.py --dataset <id> --desde modelado      # stg+analytics sin re-subir

La ruta de origen SIEMPRE es un argumento: nada apunta a un archivo fijo.

Las fases son reanudables. La ingesta de 1,17M filas tarda minutos y el
perfilado necesita las FK del origen, así que un corte a mitad de camino no
puede obligar a recargar todo: --desde retoma en la fase que se indique.
"""
from __future__ import annotations
import argparse, pathlib, sys, time, uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import config, db, ingest, profile as perfilador, staging, analytics


def _log(fase: str, msg: str = "") -> None:
    print(f"  [{fase:<12}] {msg}", flush=True)


def fase_ingesta(source: str, dataset_id: uuid.UUID, conn) -> None:
    t0 = time.time()
    esperado = ingest.conteos_origen(source)
    _log("origen", f"{len(esperado)} tablas · {sum(esperado.values()):,} filas")

    obtenido = ingest.ingerir(source, dataset_id, conn,
                              progreso=lambda p, d: _log("ingesta", f"{p:>3}% {d}"))
    conn.commit()

    # CONTRATO · fidelidad: raw debe tener exactamente lo mismo que el origen.
    # Si la ingesta pierde filas en silencio, todo lo que viene después está mal
    # y no habría forma de notarlo.
    difs = {t: (esperado[t], obtenido.get(t, 0))
            for t in esperado if esperado[t] != obtenido.get(t, 0)}
    if difs:
        raise SystemExit(f"FIDELIDAD ROTA · el conteo no calza: {difs}")

    _log("ingesta", f"OK · {sum(obtenido.values()):,} filas en {time.time()-t0:.1f}s")
    with conn.cursor() as cur:
        cur.execute("UPDATE control.datasets SET filas_origen=%s, estado='perfilando' WHERE id=%s",
                    (__import__("json").dumps(esperado), dataset_id))
    conn.commit()


def fase_perfilado(source: str, dataset_id: uuid.UUID, conn, cfg: dict) -> None:
    t0 = time.time()
    fks = ingest.leer_fks(source) if source else []
    # Cada tabla se perfila en su propia conexión: son independientes y dos de
    # ellas concentran el grueso del trabajo, así que el reloj de pared baja de
    # la suma al máximo (12s en vez de ~40s).
    rep = perfilador.perfilar(conn, dataset_id, cfg, fks, conectar=db.conectar)
    perfilador.guardar(conn, dataset_id, rep)
    with conn.cursor() as cur:
        cur.execute("UPDATE control.datasets SET estado='modelando' WHERE id=%s", (dataset_id,))
    conn.commit()
    r = rep["resumen"]
    _log("perfilado", f"OK en {time.time()-t0:.1f}s")
    _log("perfilado", f"{r['campos_relleno']} campos de relleno · {r['columnas_constantes']} constantes · "
                      f"{r['numericas_sin_informacion']} métricas sin información · "
                      f"{r['claves_json_descartadas']} claves JSON de ruido")


def fase_modelado(dataset_id: uuid.UUID, conn, cfg: dict) -> None:
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute("SELECT perfil FROM control.datasets WHERE id=%s", (dataset_id,))
        fila = cur.fetchone()
    if fila is None:
        raise SystemExit(f"no existe el dataset {dataset_id}")
    perfil = fila[0]
    if perfil is None:
        raise SystemExit("el dataset no tiene perfilado: correr --desde perfilado (requiere --source)")
    staging.construir(conn, dataset_id, cfg, perfil)
    _log("staging", "6 vistas")
    claves = staging.claves_conservadas(perfil, "mensajes.payload")
    conteos = analytics.construir(conn, dataset_id, cfg, claves)
    with conn.cursor() as cur:
        cur.execute("UPDATE control.datasets SET estado='listo' WHERE id=%s", (dataset_id,))
    conn.commit()
    _log("analytics", f"OK en {time.time()-t0:.1f}s · " +
         " · ".join(f"{k}={v:,}" for k, v in sorted(conteos.items()) if k.startswith("fct")))


def cargar_config() -> dict:
    """El config declarado. El loader vive en config.py: lo leen también el API
    y el snapshot, y ninguno de los dos puede importar este CLI."""
    return config.cargar()


FASES = ("ingesta", "perfilado", "modelado")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="ruta al .db SQLite de origen")
    ap.add_argument("--dataset", help="dataset-id existente sobre el que retomar")
    ap.add_argument("--desde", choices=FASES, default="ingesta",
                    help="fase donde empezar (default: ingesta)")
    ap.add_argument("--nombre", help="nombre a registrar para el dataset")
    args = ap.parse_args()

    if args.desde == "ingesta" and not args.source:
        ap.error("--desde ingesta requiere --source")
    if args.desde != "ingesta" and not args.dataset:
        ap.error(f"--desde {args.desde} requiere --dataset")
    # El perfilado lee las FK DECLARADAS del esquema de origen; sin el .db no
    # puede distinguir una clave foránea de una métrica y la Regla B daría
    # veredictos sobre columnas que son identificadores.
    if args.desde == "perfilado" and not args.source:
        ap.error("--desde perfilado requiere --source (las FK se leen del origen)")

    ruta = None
    if args.source:
        ruta = pathlib.Path(args.source)
        if not ruta.exists():
            ap.error(f"no existe: {ruta}")

    with db.conectar() as conn:
        if args.desde == "ingesta":
            dataset_id = uuid.uuid4()
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO control.datasets (id, archivo, bytes, estado) "
                    "VALUES (%s,%s,%s,'ingiriendo')",
                    (dataset_id, args.nombre or ruta.name, ruta.stat().st_size))
            conn.commit()
            print(f"\ndataset_id = {dataset_id}\n")
        else:
            dataset_id = uuid.UUID(args.dataset)
            _log("retomando", f"dataset {dataset_id} desde {args.desde}")

        cfg = cargar_config()
        pendientes = FASES[FASES.index(args.desde):]
        if "ingesta" in pendientes:
            fase_ingesta(str(ruta), dataset_id, conn)
        if "perfilado" in pendientes:
            fase_perfilado(str(ruta) if ruta else "", dataset_id, conn, cfg)
        if "modelado" in pendientes:
            fase_modelado(dataset_id, conn, cfg)

    print("\n  listo.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
