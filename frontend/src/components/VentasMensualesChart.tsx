/* Ventas cerradas en cada mes calendario. Una medida, una línea, una fecha. */
import type { CohorteRow, VentaMesRow } from '../types'
import { mesCorto, mesLargo, n0 } from '../format'
import { useTooltip } from './Tooltip'

const ANCHO = 880, ALTO = 194, IZQ = 46, DER = 16, ARRIBA = 28, ABAJO = 30
const BASE = ALTO - ABAJO
const PISTA = ANCHO - IZQ - DER

function escala(max: number): { hi: number; paso: number } {
  const bruto = Math.max(max, 1) / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= bruto) ?? 10 * mag
  return { hi: Math.max(paso, Math.ceil(max / paso) * paso), paso }
}

function Punto({ fila, leads, x, y, parcial }: {
  fila: VentaMesRow; leads?: number; x: number; y: number; parcial: boolean
}) {
  const filas: [string, string][] = [['Ventas cerradas', n0(fila.ventas)]]
  if (leads !== undefined) filas.push(['Leads que entraron', n0(leads)])
  const tip = useTooltip({
    titulo: mesLargo(fila.mes),
    filas,
    nota: leads === undefined
      ? (parcial ? 'El mes todavía está en curso.' : undefined)
      : `Ventas = cierres; leads = entradas del mes.${parcial ? ' Mes en curso.' : ''}`,
  })
  return (
    <g {...tip}>
      <circle cx={x} cy={y} r={14} fill="transparent" />
      <circle cx={x} cy={y} r={4.5} fill="var(--serie-1)" opacity={parcial ? 0.45 : 1}
              stroke="var(--superficie)" strokeWidth={2} />
    </g>
  )
}

export function VentasMensualesChart({ filas, leadsPorMes, corte }: {
  filas: VentaMesRow[]; leadsPorMes?: CohorteRow[]; corte: string
}) {
  if (!filas.length) return <p className="vacio">No hay ventas en la selección.</p>
  const ventas = [...filas].sort((a, b) => (a.mes < b.mes ? -1 : 1))
  const max = Math.max(...ventas.map((v) => v.ventas))
  const { hi, paso } = escala(max)
  const mesCorte = corte.slice(0, 7)
  const indiceParcial = ventas.findIndex((v) => v.mes === mesCorte)
  const parcial = indiceParcial >= 0
  const px = (i: number) => ventas.length === 1 ? IZQ + PISTA / 2 : IZQ + (PISTA * i) / (ventas.length - 1)
  const h = (v: number) => ((BASE - ARRIBA) * v) / hi
  const py = (v: number) => BASE - h(v)
  const ticks: number[] = []
  for (let v = 0; v <= hi + 0.001; v += paso) ticks.push(Math.round(v * 10) / 10)
  const indicesCompletos = ventas.map((_, i) => i).filter((i) => i !== indiceParcial)
  const lineaCompleta = indicesCompletos
    .map((i, j) => `${j === 0 ? 'M' : 'L'} ${px(i)} ${py(ventas[i].ventas)}`)
    .join(' ')
  const ultimoCompleto = indicesCompletos.at(-1) ?? 0
  const indiceMax = ventas.findIndex((v) => v.ventas === max)
  const destacados = new Set([indiceMax, ultimoCompleto, ...(parcial ? [indiceParcial] : [])])
  const leads = new Map(leadsPorMes?.map((v) => [v.mes, v.leads]))

  return (
    <figure className="apretada">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" preserveAspectRatio="xMinYMin meet"
           role="img" aria-label={`Ventas cerradas por mes, entre ${n0(Math.min(...ventas.map((v) => v.ventas)))} y ${n0(max)}`}>
        {ticks.map((v) => {
          const y = py(v)
          return (
            <g key={v}>
              <line x1={IZQ} y1={y} x2={ANCHO - DER} y2={y} className="reja" />
              <text x={IZQ - 8} y={y + 4} textAnchor="end">{n0(v)}</text>
            </g>
          )
        })}
        {lineaCompleta && (
          <path d={lineaCompleta} fill="none" stroke="var(--serie-1)" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
        )}
        {parcial && indiceParcial > 0 && (
          <line x1={px(indiceParcial - 1)} y1={py(ventas[indiceParcial - 1].ventas)}
                x2={px(indiceParcial)} y2={py(ventas[indiceParcial].ventas)}
                stroke="var(--serie-1)" strokeWidth={2.5} strokeDasharray="5 5" opacity={0.45} />
        )}
        {ventas.map((v, i) => {
          const y = py(v.ventas)
          return (
            <g key={v.mes}>
              <Punto fila={v} leads={leads.get(v.mes)} x={px(i)} y={y} parcial={i === indiceParcial} />
              {destacados.has(i) && (
                <text x={px(i)} y={y - 10} textAnchor="middle" className="valor">
                  {n0(v.ventas)}
                </text>
              )}
              <text x={px(i)} y={ALTO - 8} textAnchor="middle">
                {mesCorto(v.mes)}
              </text>
            </g>
          )
        })}
      </svg>
      {parcial && (
        <figcaption>{mesLargo(mesCorte)} incluye datos hasta el día {Number(corte.slice(8, 10))}.</figcaption>
      )}
    </figure>
  )
}
