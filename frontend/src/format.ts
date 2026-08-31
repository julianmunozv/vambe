/* Formato es-CL en un solo lugar: punto de miles, coma decimal. */

const nf = new Intl.NumberFormat('es-CL')

export const n0 = (x: number | null | undefined): string =>
  x === null || x === undefined ? '—' : nf.format(Math.round(x))

export const pct1 = (x: number | null | undefined): string =>
  x === null || x === undefined ? '—' : `${x.toFixed(1).replace('.', ',')}%`

export const dias1 = (x: number | null | undefined): string =>
  x === null || x === undefined ? '—' : `${x.toFixed(1).replace('.', ',')} d`

/** Múltiplo: 5,5×. Una razón entre dos tasas no es un porcentaje — mostrarla
 *  como 550% se lee como una tasa más de las que ya están en la franja. */
export const veces1 = (x: number | null | undefined): string =>
  x === null || x === undefined ? '—' : `${x.toFixed(1).replace('.', ',')}×`

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '2026-06-15' → '15 jun 2026' */
export const fechaCorta = (d: string): string =>
  `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

/** '2026-06' → 'jun 2026' */
export const mesLargo = (m: string): string => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`

/** Eje compacto: solo el mes, salvo en enero donde el año orienta la serie. */
export const mesCorto = (m: string): string =>
  `${MESES[Number(m.slice(5)) - 1]}${m.slice(5) === '01' ? ` ${m.slice(2, 4)}` : ''}`
