/*
 * El asistente — espejo de backend/api/kpis/ia.py.
 *
 * El tramo de SLA NO se decide acá: viene ya resuelto como índice desde
 * backend/snapshot/build.py, con el mismo CASE que usa la query. Este módulo
 * solo agrupa por ese índice.
 */
import type { HandoffRow, HerramientaRow, Snapshot } from '../types'
import { pct } from './base'

export function handoff(S: Snapshot, sel: number[]): HandoffRow[] {
  const c = S.col
  const acc = S.tramos.map((tramo, orden) => ({ tramo, orden, leads: 0, ganados: 0 }))
  for (const i of sel) {
    const t = acc[c.sla[i]]
    t.leads++
    t.ganados += c.g[i]
  }
  return acc.map((t) => ({ ...t, tasa_conversion: pct(t.ganados, t.leads) }))
}

export function herramientas(S: Snapshot, sel: number[]): HerramientaRow[] {
  return S.herramientas.map((h, k) => {
    let llamadas = 0, fallos = 0, tocados = 0, ganados = 0
    for (const i of sel) {
      const n = S.tool_llamadas[k][i]
      if (!n) continue
      llamadas += n
      fallos += S.tool_fallos[k][i]
      tocados++
      ganados += S.col.g[i]
    }
    return {
      herramienta: h, llamadas, leads_tocados: tocados,
      tasa_fallo: pct(fallos, llamadas),
      conversion_de_tocados: pct(ganados, tocados),
    }
  }).sort((a, b) => b.llamadas - a.llamadas)
}
