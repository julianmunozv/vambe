/* Ventas cerradas por mes — espejo de backend/api/kpis/ventas.py. */
import type { Snapshot, VentaMesRow } from '../types'

export function ventasMes(S: Snapshot, sel: number[]): VentaMesRow[] {
  const conteo = new Map<number, number>()
  for (const i of sel) {
    const mes = S.col.mg[i]
    if (mes < 0) continue
    conteo.set(mes, (conteo.get(mes) ?? 0) + 1)
  }
  return [...conteo].map(([mes, ventas]) => ({
    mes: S.dic.mes[mes],
    ventas,
  })).sort((a, b) => (a.mes < b.mes ? -1 : 1))
}
