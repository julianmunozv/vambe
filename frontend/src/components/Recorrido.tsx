/*
 * El recorrido del lead, de la entrada a la venta.
 *
 * Barras horizontales y no columnas: los nombres de etapa vienen de los datos y
 * son largos («Test Drive Agendado»), así que en columnas habría que abreviarlos
 * o rotarlos. Acá el rótulo se lee de corrido a la izquierda y la caída queda a
 * la derecha, alineada — que es la columna que se recorre con la vista.
 *
 * Los pasos son etapas ALCANZADAS, no ocupantes actuales: «Negociación» hoy
 * tiene cero ocupantes y pasaron miles de leads por ahí.
 */
import type { Paso } from '../kpis/panorama'
import { n0 } from '../format'
import { useTooltip } from './Tooltip'

const pct0 = (x: number): string => `${x.toFixed(0)}%`

function Fila({ p }: { p: Paso }) {
  const tip = useTooltip({
    titulo: p.rotulo,
    filas: [
      ['Leads que llegaron', n0(p.valor)],
      ['De los que entran', pct0(p.share)],
      ...(p.caida !== null
        ? ([['Se pierde en este salto', pct0(p.caida)]] as [string, string][]) : []),
    ],
  })
  return (
    <li {...tip} data-venta={p.esVenta ? 'si' : 'no'}>
      <span className="rotulo">{p.rotulo}</span>
      <span className="pista"><i style={{ width: `${Math.max(1.5, p.share)}%` }} /></span>
      <span className="valor num">{n0(p.valor)}</span>
      <span className="caida num">{p.caida === null ? '' : `−${pct0(p.caida)}`}</span>
    </li>
  )
}

export function Recorrido({ pasos }: { pasos: Paso[] }) {
  if (!pasos.length) return <p className="vacio">Sin leads en la selección.</p>
  return <ul className="recorrido">{pasos.map((p) => <Fila key={p.rotulo} p={p} />)}</ul>
}
