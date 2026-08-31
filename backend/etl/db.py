"""Conexión a Postgres. La URL viene de DATABASE_URL, nunca hardcodeada."""
from __future__ import annotations
import os, pathlib
import psycopg

import config


def dsn() -> str:
    """La URL sale del entorno; el .env es solo la comodidad de desarrollo.

    Se busca hacia arriba desde este archivo en vez de fijar una ruta: así el
    módulo no depende de a qué profundidad del repo lo muevan.
    """
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    for carpeta in pathlib.Path(__file__).resolve().parents:
        env = carpeta / ".env"
        if env.exists():
            for linea in env.read_text().splitlines():
                if linea.startswith("DATABASE_URL="):
                    return linea.split("=", 1)[1].strip()
    raise RuntimeError("Falta DATABASE_URL (variable de entorno o archivo .env)")


def conectar(autocommit: bool = False) -> psycopg.Connection:
    """Toda conexión del proyecto pasa por acá — ETL, API y snapshot.

    La zona horaria se impone en la conexión y no se hereda del servidor: es lo
    que decide a qué mes pertenece un timestamptz, así que dejarla al default
    hace que el mismo export dé un número distinto en cada máquina. Va como
    opción de arranque (`-c timezone=`) y no como un SET posterior para que
    valga desde la primera consulta, incluso si alguien reusa la conexión sin
    pasar por este módulo.
    """
    return psycopg.connect(
        dsn(),
        autocommit=autocommit,
        options=f"-c timezone={config.zona_horaria()}",
    )
