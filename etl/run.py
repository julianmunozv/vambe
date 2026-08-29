"""
CLI del pipeline.

    python etl/run.py --source data/raw/vambe_concesionaria.db
    python etl/run.py --rebuild <dataset-id>     # stg+analytics sin re-subir

La ruta de origen SIEMPRE es un argumento: nada apunta a un archivo fijo.
"""
from __future__ import annotations
import argparse, pathlib, sys, time, uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import yaml
import db, ingest, profile as perfilador, staging, analytics


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
    rep = perfilador.perfilar(conn, dataset_id, cfg, fks)
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
        perfil = cur.fetchone()[0]
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
    return yaml.safe_load((pathlib.Path(__file__).resolve().parent / "config.yml").read_text())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="ruta al .db SQLite a ingerir")
    ap.add_argument("--rebuild", help="dataset-id: re-corre stg+analytics sin re-ingerir")
    ap.add_argument("--nombre", help="nombre a registrar para el dataset")
    args = ap.parse_args()

    if not args.source and not args.rebuild:
        ap.error("se requiere --source o --rebuild")

    with db.conectar() as conn:
        if args.source:
            ruta = pathlib.Path(args.source)
            if not ruta.exists():
                ap.error(f"no existe: {ruta}")
            dataset_id = uuid.uuid4()
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO control.datasets (id, archivo, bytes, estado) "
                    "VALUES (%s,%s,%s,'ingiriendo')",
                    (dataset_id, args.nombre or ruta.name, ruta.stat().st_size))
            conn.commit()
            print(f"\ndataset_id = {dataset_id}\n")
            fase_ingesta(str(ruta), dataset_id, conn)
            cfg = cargar_config()
            fase_perfilado(str(ruta), dataset_id, conn, cfg)
            fase_modelado(dataset_id, conn, cfg)
        else:
            dataset_id = uuid.UUID(args.rebuild)
            _log("rebuild", f"dataset {dataset_id}")
            fase_modelado(dataset_id, conn, cargar_config())

    print("\n  listo.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
