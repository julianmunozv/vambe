/*
 * Conversión por cohorte de entrada — espejo de backend/api/kpis/cohortes.py.
 *
 * El KPI con la trampa más cara del dataset: comparar el resultado final de un
 * mes con 350 días de antigüedad contra uno de 46 mide la edad de las cohortes,
 * no el negocio. Por eso la serie es la de la VENTANA: todos los meses medidos
 * dentro de los mismos primeros días del lead.
 *
 * `gv` —ganó dentro de la ventana— viene ya decidido en SQL desde
 * backend/snapshot/build.py. Acá solo se cuenta.
 */
import type { CohorteRow, Snapshot } from '../types'
import { pct } from './base'

export function cohortes(S: Snapshot, sel: number[]): CohorteRow[] {
  const c = S.col
  const g = new Map<number, {
    leads: number; ganados: number; ventana: number; cerrados: number; ultimo: number
  }>()
  // Contra el corte del DATASET, no el del filtro: si el usuario mira sep–dic
  // 2025, esos meses siguen siendo comparables — el tiempo pasó igual.
  const corte = S.contexto.dia_corte
  for (const i of sel) {
    const k = c.me[i]
    let x = g.get(k)
    if (!x) g.set(k, (x = { leads: 0, ganados: 0, ventana: 0, cerrados: 0, ultimo: -1 }))
    x.leads++; x.ganados += c.g[i]; x.ventana += c.gv[i]; x.cerrados += c.t[i]
    if (c.dia[i] > x.ultimo) x.ultimo = c.dia[i]
  }
  return [...g].map(([k, x]) => ({
    mes: S.dic.mes[k], leads: x.leads, ganados: x.ganados,
    tasa_conversion: pct(x.ganados, x.leads),
    ganados_ventana: x.ventana,
    tasa_ventana: pct(x.ventana, x.leads),
    abiertos: x.leads - x.cerrados,
    medible: corte - x.ultimo >= S.contexto.ventana_dias,
  })).sort((a, b) => (a.mes < b.mes ? -1 : 1))
}
