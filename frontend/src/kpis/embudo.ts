/*
 * Embudo y cartera detenida — espejo de backend/api/kpis/embudo.py.
 *
 * Las dos caras de la misma pregunta: por dónde se caen los leads (pasado) y
 * quién está esperando una llamada hoy (presente).
 */
import type { EstancadoRow, EtapaRow, Snapshot } from '../types'
import { percentil, red } from './base'

/* Embudo por etapa ALCANZADA, no por etapa actual: Negociación es de paso y hoy
   tiene cero ocupantes, aunque pasaron 3.775 leads por ahí. */
export function embudo(S: Snapshot, sel: number[]): EtapaRow[] {
  return S.etapas.map((etapa, e) => {
    const dias: number[] = []
    let alcanzaron = 0, aqui = 0
    for (const i of sel) {
      const d = S.dias_etapa[e][i]
      if (d < 0) continue
      alcanzaron++
      dias.push(d)
      if (S.col.eact[i] === e + 1) aqui++
    }
    return {
      etapa, orden: e + 1, alcanzaron, estancados_aqui: aqui,
      dias_mediana: red(percentil(dias, 0.5), 1),
    }
  })
}

/* La lista de trabajo: leads abiertos hoy, por etapa y antigüedad. */
export function estancados(S: Snapshot, sel: number[]): EstancadoRow[] {
  const c = S.col
  const filas: EstancadoRow[] = S.etapas.map((etapa, e) => ({
    etapa, orden: e + 1, abiertos: 0, d0_7: 0, d8_30: 0, d31_90: 0, d90_mas: 0, dias_max: 0,
  }))
  for (const i of sel) {
    const e = c.eact[i]
    if (!e) continue                       // terminal: no está estancado
    const f = filas[e - 1]
    const d = c.dact[i]
    if (!f || d < 0) continue
    f.abiertos++
    if (d <= 7) f.d0_7++
    else if (d <= 30) f.d8_30++
    else if (d <= 90) f.d31_90++
    else f.d90_mas++
    if (d > f.dias_max) f.dias_max = d
  }
  return filas.map((f) => ({ ...f, dias_max: Math.round(f.dias_max) })).filter((f) => f.abiertos > 0)
}
