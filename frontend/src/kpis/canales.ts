/*
 * Adquisición — espejo de backend/api/kpis/canales.py.
 *
 * Volumen al lado de la tasa, siempre: un canal de 300 leads al 25% y uno de
 * 15.000 al 4,5% no se comparan por la tasa sola.
 *
 * Cuatro cortes de la misma pregunta: el agregado (`canales`), el mismo corte
 * mes a mes (`canalesMes`), el canal abierto por su fuente concreta
 * (`origenes`) y solo el canal pagado (`campanas`, que ya no alimenta ninguna
 * pantalla: `origenes` lo contiene, con el nombre de la campaña en vez del id).
 */
import type { CampanaRow, CanalMesRow, CanalRow, OrigenRow, Snapshot } from '../types'
import { pct, promedio, red } from './base'

export function canales(S: Snapshot, sel: number[]): CanalRow[] {
  const c = S.col
  const g = new Map<number, { leads: number; ganados: number; td: number; dias: number[]; msg: number }>()
  for (const i of sel) {
    const k = c.ca[i]
    if (k < 0) continue
    let x = g.get(k)
    if (!x) g.set(k, (x = { leads: 0, ganados: 0, td: 0, dias: [], msg: 0 }))
    x.leads++; x.ganados += c.g[i]; x.td += c.td[i]; x.msg += c.nmsg[i]
    if (c.dias[i] >= 0) x.dias.push(c.dias[i])
  }
  return [...g].map(([k, x]) => ({
    canal: S.dic.canal[k], leads: x.leads, ganados: x.ganados,
    tasa_conversion: pct(x.ganados, x.leads),
    tasa_test_drive: pct(x.td, x.leads),
    dias_promedio: red(promedio(x.dias), 1),
    mensajes_promedio: red(x.msg / x.leads, 1),
  })).sort((a, b) => b.leads - a.leads)
}

export function campanas(S: Snapshot, sel: number[]): CampanaRow[] {
  const c = S.col
  const g = new Map<number, { leads: number; ganados: number; td: number; pl: number; ob: number }>()
  for (const i of sel) {
    const k = c.cp[i]
    if (k < 0) continue
    let x = g.get(k)
    if (!x) g.set(k, (x = { leads: 0, ganados: 0, td: 0, pl: c.pl[i], ob: c.ob[i] }))
    x.leads++; x.ganados += c.g[i]; x.td += c.td[i]
  }
  return [...g].map(([k, x]) => ({
    campana: S.dic.campana[k], platform: S.dic.platform[x.pl], objetivo: S.dic.objetivo[x.ob],
    leads: x.leads, ganados: x.ganados,
    tasa_conversion: pct(x.ganados, x.leads),
    tasa_test_drive: pct(x.td, x.leads),
  })).sort((a, b) => b.leads - a.leads)
}

/**
 * La serie mensual de cada canal. Espejo de `canales_mes` en SQL.
 *
 * `medible` se calcula por MES sobre TODA la población filtrada —antes de
 * separar por canal— igual que en la query, donde el CTE `edad` agrupa `pob`
 * solo por mes. Calcularla dentro de cada canal daría cuatro cortes distintos
 * para el mismo mes.
 */
export function canalesMes(S: Snapshot, sel: number[]): CanalMesRow[] {
  const c = S.col
  // Contra el corte del DATASET, no el del filtro: mirar sep–dic 2025 no vuelve
  // incomparables a esas cohortes, ya pasó el tiempo real. Igual que en `cohortes`.
  const corte = S.contexto.dia_corte
  const ultimo = new Map<number, number>()
  const g = new Map<string, {
    me: number; ca: number; leads: number; ganados: number; ventana: number
  }>()
  for (const i of sel) {
    const me = c.me[i]
    if (c.dia[i] > (ultimo.get(me) ?? -1)) ultimo.set(me, c.dia[i])
    const ca = c.ca[i]
    if (ca < 0) continue
    const k = `${me}|${ca}`
    let x = g.get(k)
    if (!x) g.set(k, (x = { me, ca, leads: 0, ganados: 0, ventana: 0 }))
    x.leads++; x.ganados += c.g[i]; x.ventana += c.gv[i]
  }
  return [...g.values()].map((x) => ({
    mes: S.dic.mes[x.me], canal: S.dic.canal[x.ca],
    leads: x.leads, ganados: x.ganados,
    tasa_conversion: pct(x.ganados, x.leads),
    ganados_ventana: x.ventana,
    tasa_ventana: pct(x.ventana, x.leads),
    medible: corte - (ultimo.get(x.me) ?? corte) >= S.contexto.ventana_dias,
  })).sort((a, b) => (a.mes === b.mes ? (a.canal < b.canal ? -1 : 1) : a.mes < b.mes ? -1 : 1))
}

/** El canal abierto por la fuente concreta del lead. Espejo de `origenes`. */
export function origenes(S: Snapshot, sel: number[]): OrigenRow[] {
  const c = S.col
  const g = new Map<number, {
    ca: number; cp: number; leads: number; ganados: number; td: number
    dias: number[]; msg: number
  }>()
  for (const i of sel) {
    const k = c.og[i]
    if (k < 0) continue
    let x = g.get(k)
    if (!x) g.set(k, (x = { ca: c.ca[i], cp: c.cp[i], leads: 0, ganados: 0, td: 0, dias: [], msg: 0 }))
    x.leads++; x.ganados += c.g[i]; x.td += c.td[i]; x.msg += c.nmsg[i]
    if (c.dias[i] >= 0) x.dias.push(c.dias[i])
  }
  return [...g].map(([k, x]) => ({
    canal: S.dic.canal[x.ca],
    origen: S.dic.origen[k],
    // el COALESCE(campana, origen_detalle) de la query
    rotulo: x.cp >= 0 ? S.dic.campana[x.cp] : S.dic.origen[k],
    leads: x.leads, ganados: x.ganados,
    tasa_conversion: pct(x.ganados, x.leads),
    tasa_test_drive: pct(x.td, x.leads),
    dias_promedio: red(promedio(x.dias), 1),
    mensajes_promedio: red(x.msg / x.leads, 1),
  })).sort((a, b) => b.leads - a.leads)
}
