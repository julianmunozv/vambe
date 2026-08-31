"""
Acceso al config declarado (`config.yml`).

Vive en su propio módulo porque lo leen tres procesos distintos: el ETL (que lo
pasa al perfilado y al modelado), el API (que necesita la ventana de observación
de las cohortes para decidir qué mes es comparable y para rotularla) y el
snapshot. Con el loader dentro de `run.py`, el API tendría que importar el CLI
del pipeline para leer un umbral.

Sin cachear a propósito: el API corre con --reload y un umbral que cambia en el
archivo tiene que verse en la próxima respuesta, no en el próximo reinicio.
"""
from __future__ import annotations
import pathlib

import yaml

RUTA = pathlib.Path(__file__).resolve().parent / "config.yml"


def cargar() -> dict:
    return yaml.safe_load(RUTA.read_text())


def ventana_dias() -> int:
    """Edad a la que se mide cada cohorte de leads. Ver `cohortes` en config.yml.

    Es UN solo número para dos cosas que tienen que ser la misma: la ventana en
    la que se cuenta una venta, y la edad mínima que necesita un mes para poder
    compararse. Si fueran dos, el panel podría dibujar un mes cuya ventana
    todavía no terminó.
    """
    return int(cargar()["cohortes"]["ventana_dias"])
