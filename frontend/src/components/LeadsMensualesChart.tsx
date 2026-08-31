/* Leads creados en cada mes calendario. El mes del corte se muestra incompleto. */
import type { CohorteRow } from '../types'
import { mesCorto, mesLargo, n0 } from '../format'
import { useTooltip } from './Tooltip'

const ANCHO = 880, ALTO = 194, IZQ = 52, DER = 16, ARRIBA = 28, ABAJO = 30
const BASE = ALTO - ABAJO
const PISTA = ANCHO - IZQ - DER

function escala(max: number): { hi: number; paso: number } {
  const bruto = Math.max(max, 1) / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= bruto) ?? 10 * mag
  return { hi: Math.max(paso, Math.ceil(max / paso) * paso), paso }
}

function Punto({ fila, x, y, parcial }: {
  fila: CohorteRow; x: number; y: number; parcial: boolean
}) {
  const tip = useTooltip({
    titulo: mesLargo(fila.mes),
    filas: [['Leads que entraron', n0(fila.leads)]],
    nota: parcial ? 'El mes todavía está en curso.' : undefined,
  })
  return (
    <g {...tip}>
      <circle cx={x} cy={y} r={14} fill="transparent" />
      <circle cx={x} cy={y} r={4.5} fill="var(--serie-3)" opacity={parcial ? 0.45 : 1}
              stroke="var(--superficie)" strokeWidth={2} />
    </g>
  )
}

export function LeadsMensualesChart({ filas, corte }: { filas: CohorteRow[]; corte: string }) {
  if (!filas.length) return <p className="vacio">No hay leads en la selección.</p>
  const leads = [...filas].sort((a, b) => (a.mes < b.mes ? -1 : 1))
  const max = Math.max(...leads.map((v) => v.leads))
  const { hi, paso } = escala(max)
  const mesCorte = corte.slice(0, 7)
  const indiceParcial = leads.findIndex((v) => v.mes === mesCorte)
  const parcial = indiceParcial >= 0
  const px = (i: number) => leads.length === 1 ? IZQ + PISTA / 2 : IZQ + (PISTA * i) / (leads.length - 1)
  const py = (v: number) => BASE - ((BASE - ARRIBA) * v) / hi
  const ticks: number[] = []
  for (let v = 0; v <= hi + 0.001; v += paso) ticks.push(Math.round(v * 10) / 10)
  const indicesCompletos = leads.map((_, i) => i).filter((i) => i !== indiceParcial)
  const lineaCompleta = indicesCompletos
    .map((i, j) => `${j === 0 ? 'M' : 'L'} ${px(i)} ${py(leads[i].leads)}`)
    .join(' ')
  const ultimoCompleto = indicesCompletos.at(-1) ?? 0
  const indiceMax = leads.findIndex((v) => v.leads === max)
  const destacados = new Set([indiceMax, ultimoCompleto, ...(parcial ? [indiceParcial] : [])])

  return (
    <figure className="apretada">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" preserveAspectRatio="xMinYMin meet"
           role="img" aria-label={`Leads que entraron por mes, entre ${n0(Math.min(...leads.map((v) => v.leads)))} y ${n0(max)}`}>
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
          <path d={lineaCompleta} fill="none" stroke="var(--serie-3)" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
        )}
        {parcial && indiceParcial > 0 && (
          <line x1={px(indiceParcial - 1)} y1={py(leads[indiceParcial - 1].leads)}
                x2={px(indiceParcial)} y2={py(leads[indiceParcial].leads)}
                stroke="var(--serie-3)" strokeWidth={2.5} strokeDasharray="5 5" opacity={0.45} />
        )}
        {leads.map((v, i) => {
          const y = py(v.leads)
          return (
            <g key={v.mes}>
              <Punto fila={v} x={px(i)} y={y} parcial={i === indiceParcial} />
              {destacados.has(i) && (
                <text x={px(i)} y={y - 10} textAnchor="middle" className="valor">
                  {n0(v.leads)}
                </text>
              )}
              <text x={px(i)} y={ALTO - 8} textAnchor="middle">{mesCorto(v.mes)}</text>
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
