/*
 * Lo único que comparten todos los KPIs del arnés de verificación: los
 * primitivos numéricos y el filtrado de la población.
 *
 * Acá NO se decide nada de negocio. `es_ganado`, `transferido`, el tramo de SLA
 * y las etapas alcanzadas ya vienen resueltos en SQL desde
 * backend/snapshot/build.py; estos helpers solo cuentan y promedian. Si acá hay
 * que decidir algo, la comparación con el API deja de significar nada.
 */
import type { Filtros, Snapshot } from '../types'

/** percentile_cont de Postgres: interpolación lineal, no el vecino más cercano. */
export function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const pos = (v.length - 1) * p
  const bajo = Math.floor(pos)
  const alto = Math.ceil(pos)
  if (bajo === alto) return v[bajo]
  return v[bajo] + (v[alto] - v[bajo]) * (pos - bajo)
}

/* Dos decimales, exactamente como el ROUND(...,2) de las queries. Redondear a
   uno acá y otra vez al mostrar desplazaba tasas medio punto en los .x5. */
export const pct = (num: number, den: number): number | null =>
  den ? Math.round((10000 * num) / den) / 100 : null

export const red = (x: number | null, n: number): number | null =>
  x === null ? null : Math.round(x * 10 ** n) / 10 ** n

export const promedio = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

/**
 * Índices de las filas que pasan los filtros. Todo lo demás se calcula sobre
 * este arreglo, así que las secciones miran siempre la misma población — que es
 * justamente lo que garantiza el WHERE compartido del lado del API.
 */
export function seleccionar(S: Snapshot, f: Filtros): number[] {
  const c = S.col
  const set = (clave: keyof Snapshot['dic'], vals: string[]): Set<number> | null => {
    if (!vals.length) return null
    const ids = vals.map((v) => S.dic[clave].indexOf(v)).filter((i) => i >= 0)
    // filtro pedido pero sin ningún valor válido → no pasa nadie
    return new Set(ids.length ? ids : [-999])
  }
  const fCanal = set('canal', f.canal)
  const fEmb = set('embudo', f.embudo)
  const fCiu = set('ciudad', f.ciudad)
  const fTv = set('tipo_vehiculo', f.tipo_vehiculo)
  const fVen = set('vendedor', f.vendedor)
  const meses = S.dic.mes

  const out: number[] = []
  for (let i = 0; i < S.n; i++) {
    if (fCanal && !fCanal.has(c.ca[i])) continue
    if (fEmb && !fEmb.has(c.em[i])) continue
    if (fCiu && !fCiu.has(c.ci[i])) continue
    if (fTv && !fTv.has(c.tv[i])) continue
    if (fVen && !fVen.has(c.ve[i])) continue
    const mes = meses[c.me[i]]
    if (f.desde && mes < f.desde) continue
    if (f.hasta && mes > f.hasta) continue
    out.push(i)
  }
  return out
}
