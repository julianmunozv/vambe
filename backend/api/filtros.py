"""
Filtros compartidos por todos los KPIs.

Un solo lugar que traduce los parámetros del dashboard a SQL parametrizado.
Está separado porque el valor de un dashboard es comparar: si cada endpoint
armara su propio WHERE, dos tarjetas podrían estar filtrando distinto y el
gerente no tendría forma de saberlo.

Nada se interpola: todos los valores viajan como parámetros ligados.
"""
from __future__ import annotations
from dataclasses import dataclass, field


# columna de fct_leads por la que filtra cada parámetro
CAMPOS = {
    "canal":       "canal",
    "embudo":      "embudo",
    "ciudad":      "ciudad",
    "vendedor_id": "vendedor_id",
    "tipo_vehiculo": "tipo_vehiculo",
}


@dataclass
class Filtros:
    dataset_id: str
    canal: list[str] = field(default_factory=list)
    embudo: list[str] = field(default_factory=list)
    ciudad: list[str] = field(default_factory=list)
    vendedor_id: list[int] = field(default_factory=list)
    tipo_vehiculo: list[str] = field(default_factory=list)
    desde: str | None = None      # 'YYYY-MM' inclusive
    hasta: str | None = None      # 'YYYY-MM' inclusive

    def where(self, alias: str = "l") -> tuple[str, list]:
        """Devuelve (fragmento SQL, parámetros) para un WHERE sobre fct_leads."""
        cond = [f"{alias}.dataset_id = %s"]
        params: list = [self.dataset_id]
        for nombre, columna in CAMPOS.items():
            valores = getattr(self, nombre)
            if valores:
                cond.append(f"{alias}.{columna} = ANY(%s)")
                params.append(list(valores))
        if self.desde:
            cond.append(f"{alias}.mes >= %s")
            params.append(self.desde)
        if self.hasta:
            cond.append(f"{alias}.mes <= %s")
            params.append(self.hasta)
        return " AND ".join(cond), params
