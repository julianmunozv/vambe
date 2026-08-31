"""
Lo único que comparten todas las queries de KPI: cómo se ejecutan.

Cualquier cosa de negocio vive en el módulo del KPI que la usa, nunca acá.
"""
from __future__ import annotations


def filas(cur, sql: str, params: list) -> list[dict]:
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, f)) for f in cur.fetchall()]


def uno(cur, sql: str, params: list) -> dict:
    r = filas(cur, sql, params)
    return r[0] if r else {}
