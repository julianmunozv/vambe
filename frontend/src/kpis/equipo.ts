/*
 * Equipo comercial — espejo de backend/api/kpis/equipo.py.
 *
 * Con el confusor a la vista: la tasa cruda mide sobre todo qué leads le
 * tocaron a cada quien. La comparable es la del canal pagado.
 *
 * Acá NO se decide nada: `es_ganado`, `transferido`, `respondido_por_humano` y
 * los días de la etapa actual llegan ya resueltos desde SQL. Esto cuenta y
 * promedia — que es exactamente lo que hace la query gemela.
 */
import type { Snapshot, VendedorRow } from '../types'
import { pct } from './base'

/** Días sin moverse desde los que un lead abierto deja de ser cartera. El mismo
 *  corte que usa `estancados`; si cambia, cambia en los dos lados y en el .py. */
const DIAS_PARADO = 90

interface Acumulado {
  leads: number; ganados: number
  ad: number; adGan: number; org: number; ns: number
  escalados: number; sinRespuesta: number
  abiertos: number; detenidos: number
}

const vacio = (): Acumulado => ({
  leads: 0, ganados: 0, ad: 0, adGan: 0, org: 0, ns: 0,
  escalados: 0, sinRespuesta: 0, abiertos: 0, detenidos: 0,
})

export function vendedores(S: Snapshot, sel: number[]): VendedorRow[] {
  const c = S.col
  const idxAd = S.dic.canal.indexOf('ad')
  const idxOrg = S.dic.canal.indexOf('organico')
  const g = new Map<number, Acumulado>()
  for (const i of sel) {
    const k = c.ve[i]
    if (k < 0) continue
    let x = g.get(k)
    if (!x) g.set(k, (x = vacio()))
    x.leads++; x.ganados += c.g[i]; x.ns += c.ns[i]
    if (c.ca[i] === idxAd) { x.ad++; x.adGan += c.g[i] }
    if (c.ca[i] === idxOrg) x.org++
    if (c.tr[i]) { x.escalados++; if (!c.rh[i]) x.sinRespuesta++ }
    if (!c.t[i]) {
      x.abiertos++
      // dact viene en -1 cuando el lead no tiene ocupación en curso
      if (c.dact[i] > DIAS_PARADO) x.detenidos++
    }
  }
  return [...g].map(([k, x]) => ({
    nombre: S.dic.vendedor[k], leads: x.leads, ganados: x.ganados,
    tasa_cruda: pct(x.ganados, x.leads),
    tasa_en_pagado: pct(x.adGan, x.ad),
    leads_pagado: x.ad,
    pct_organico: pct(x.org, x.leads),
    tasa_no_show: pct(x.ns, x.leads),
    escalados: x.escalados,
    sin_respuesta: x.sinRespuesta,
    tasa_sin_respuesta: pct(x.sinRespuesta, x.escalados),
    abiertos: x.abiertos,
    detenidos: x.detenidos,
  }))
    /* Por la tasa COMPARABLE, igual que el ORDER BY del .py: el orden de una
       tabla es un ranking para quien la lee, y ordenar por la cruda publicaría
       el espejismo como veredicto. El desempate por nombre replica el
       `ORDER BY ..., eq.nombre` — la base corre en collation C, que compara por
       código de carácter igual que el `<` de JavaScript. */
    .sort((a, b) => (b.tasa_en_pagado ?? -1) - (a.tasa_en_pagado ?? -1)
      || (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0))
}
