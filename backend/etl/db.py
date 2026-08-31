"""Conexión a Postgres. La URL viene de DATABASE_URL, nunca hardcodeada."""
from __future__ import annotations
import os, pathlib
import psycopg


def dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env = pathlib.Path(__file__).resolve().parent.parent / ".env"
    if env.exists():
        for linea in env.read_text().splitlines():
            if linea.startswith("DATABASE_URL="):
                return linea.split("=", 1)[1].strip()
    raise RuntimeError("Falta DATABASE_URL (variable de entorno o archivo .env)")


def conectar(autocommit: bool = False) -> psycopg.Connection:
    return psycopg.connect(dsn(), autocommit=autocommit)
