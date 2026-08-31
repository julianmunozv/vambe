/*
 * Canales: volumen y conversión, lado a lado.
 *
 * Dos medidas de escalas distintas van en DOS gráficos, nunca en dos ejes. El
 * orden de las categorías es el mismo en los dos, que es lo que permite leerlos
 * en paralelo: la barra más alta a la izquierda es la más baja a la derecha, y
 * ese contraste es justamente el hallazgo.
 */
import type { CanalRow } from '../types'
import { dias1, n0, pct1 } from '../format'
import { canalColor, canalLabel } from '../theme'
import { useTooltip } from './Tooltip'

const ANCHO = 1120, ALTO = 158, ARRIBA = 22, ABAJO = 30

function Barra(
  { c, valor, fmt, max, x, base, ancho }:
  { c: CanalRow; valor: number; fmt: (v: number) => string; max: number; x: number; base: number; ancho: number },
) {
  const tip = useTooltip({
    titulo: canalLabel(c.canal),
    filas: [
      ['Leads', n0(c.leads)],
      ['Ventas', n0(c.ganados)],
      ['Conversión', pct1(c.tasa_conversion)],
      ['Llegan a test drive', pct1(c.tasa_test_drive)],
      ['Días promedio', dias1(c.dias_promedio)],
    ],
  })
  const h = max ? ((base - ARRIBA - 16) * valor) / max : 0
  return (
    <g {...tip}>
      <rect x={x} y={base - h} width={ancho} height={Math.max(2, h)} rx={4} fill={canalColor(c.canal)} />
      <text x={x + ancho / 2} y={base - h - 8} textAnchor="middle" className="valor">{fmt(valor)}</text>
      <text x={x + ancho / 2} y={base + 16} textAnchor="middle">{canalLabel(c.canal)}</text>
    </g>
  )
}

export function ChannelChart({ canales }: { canales: CanalRow[] }) {
  const cs = canales.filter((c) => c.leads > 0)
  if (!cs.length) return <p className="vacio">Sin canales en la selección.</p>

  const mitad = (ANCHO - 40) / 2
  const base = ALTO - ABAJO
  const anchoBarra = Math.min(64, (mitad - 40) / cs.length - 16)
  const paneles: { titulo: string; valor: (c: CanalRow) => number; fmt: (v: number) => string; dx: number }[] = [
    { titulo: 'Leads', valor: (c) => c.leads, fmt: n0, dx: 0 },
    { titulo: 'Conversión a venta', valor: (c) => c.tasa_conversion ?? 0, fmt: pct1, dx: mitad + 40 },
  ]

  return (
    <figure>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO + 26}`} width="100%" height={ALTO + 26}
           preserveAspectRatio="xMinYMin meet" role="img"
           aria-label="Leads y conversión por canal, en dos paneles con el mismo orden de categorías">
        {paneles.map((p) => {
          const max = Math.max(...cs.map(p.valor))
          return (
            <g key={p.titulo}>
              <text x={p.dx + 8} y={10} className="etiq">{p.titulo}</text>
              <line x1={p.dx + 8} y1={base} x2={p.dx + mitad} y2={base} className="reja" />
              {cs.map((c, i) => (
                <Barra key={c.canal} c={c} valor={p.valor(c)} fmt={p.fmt} max={max} base={base}
                       ancho={anchoBarra} x={p.dx + 32 + i * ((mitad - 48) / cs.length)} />
              ))}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
