/*
 * Resumen ejecutivo — espejo de backend/api/kpis/resumen.py.
 *
 * Es lo único que lee quien tiene treinta segundos, así que cada tasa viaja con
 * el volumen que la sostiene.
 */
import type { Resumen, Snapshot } from '../types'
import { pct, percentil, red } from './base'

export function resumen(S: Snapshot, sel: number[]): Resumen {
  const c = S.col
  let ganados = 0, cerrados = 0, td = 0, tr = 0, ns = 0, huerfanos = 0
  const dias: number[] = []
  // Aparte: el ciclo de venta se mide solo sobre los ganados. Mezclarlos con los
  // que mueren rápido da 11,2 d contra los 25,0 d reales de una venta.
  const diasGanados: number[] = []
  for (const i of sel) {
    ganados += c.g[i]; cerrados += c.t[i]; td += c.td[i]; tr += c.tr[i]; ns += c.ns[i]
    if (c.tr[i] && !c.rh[i]) huerfanos++
    if (c.dias[i] >= 0) {
      dias.push(c.dias[i])
      if (c.g[i]) diasGanados.push(c.dias[i])
    }
  }
  const n = sel.length
  return {
    leads: n, ganados, cerrados, abiertos: n - cerrados,
    tasa_conversion: pct(ganados, n),
    tasa_test_drive: pct(td, n),
    tasa_transferencia: pct(tr, n),
    handoff_sin_respuesta: huerfanos,
    tasa_handoff_perdido: pct(huerfanos, n),
    tasa_no_show: pct(ns, n),
    dias_mediana: red(percentil(dias, 0.5), 1),
    dias_a_venta: red(percentil(diasGanados, 0.5), 1),
  }
}
