/*
 * Cómo convierte cada fuente: las fuentes concretas, ordenadas por lo que cierran.
 *
 * «Orgánico convierte al 24,7%» es un promedio que no describe a ninguna de sus
 * fuentes: el link de WhatsApp va al 34,1% y el botón del sitio al 17,2%, con el
 * botón trayendo cuatro veces más volumen. Repartir presupuesto sobre el
 * promedio del canal reparte igual entre dos fuentes que rinden el doble una que
 * la otra.
 *
 * Va ordenada por CONVERSIÓN y no agrupada por canal: el agrupamiento por canal
 * ya está arriba, en la comparación de canales. El ranking suelto muestra lo que
 * ese agrupamiento esconde — que las cuatro mejores fuentes salen de dos canales
 * distintos y ninguna es la más grande.
 *
 * Es una lista y no un SVG a propósito: el alto lo manda la cantidad de fuentes
 * y no la proporción de un viewBox, que a lo ancho de la pantalla pediría cientos
 * de píxeles de alto para dibujar una docena de filas.
 *
 * La barra mide conversión y el número de la derecha es el volumen, en la misma
 * fila: la tasa sola hace que una fuente de 700 leads parezca la estrategia, y
 * el volumen solo esconde que la fuente más grande es la que peor cierra.
 */
import type { OrigenRow } from '../types'
import { n0, pct1 } from '../format'
import { canalColor, canalLabel } from '../theme'
import { useTooltip } from './Tooltip'

function Fila({ o, max, maxLeads }: { o: OrigenRow; max: number; maxLeads: number }) {
  const tip = useTooltip({
    titulo: o.rotulo,
    filas: [
      ['Canal', canalLabel(o.canal)],
      ['Leads', n0(o.leads)],
      ['Ventas', n0(o.ganados)],
      ['Conversión', pct1(o.tasa_conversion)],
      ['Llegan a test drive', pct1(o.tasa_test_drive)],
    ],
  })
  return (
    <li {...tip} className={`origen ${tip.className}`}>
      <i className="marca-serie" style={{ background: canalColor(o.canal) }} />
      <span className="nombre" title={`${o.rotulo} · ${canalLabel(o.canal)}`}>{o.rotulo}</span>
      <span className="pista">
        <i style={{
          width: `${max ? (100 * (o.tasa_conversion ?? 0)) / max : 0}%`,
          background: canalColor(o.canal),
        }} />
      </span>
      <span className="conv num">{pct1(o.tasa_conversion)}</span>
      {/* El volumen va como barra tenue detrás del número: es la restricción, no
          la medición. Una segunda barra de color lo pondría a competir con la
          conversión, que es lo que se está ordenando. */}
      <span className="leads num">
        <i style={{ width: `${maxLeads ? (100 * o.leads) / maxLeads : 0}%` }} />
        <b>{n0(o.leads)}</b>
      </span>
    </li>
  )
}

export function Origenes({ origenes }: { origenes: OrigenRow[] }) {
  if (!origenes.length) return <p className="vacio">Sin orígenes en la selección.</p>

  const filas = [...origenes].sort((a, b) => (b.tasa_conversion ?? 0) - (a.tasa_conversion ?? 0))
  const max = Math.max(...filas.map((o) => o.tasa_conversion ?? 0))
  const maxLeads = Math.max(...filas.map((o) => o.leads))

  return (
    <div className="origenes">
      <ul>
        {filas.map((o) => <Fila key={o.origen} o={o} max={max} maxLeads={maxLeads} />)}
      </ul>
      <p className="pie-nota">
        La barra de color es la conversión y el subrayado gris, el volumen. El color dice de qué
        canal viene cada fuente.
      </p>
    </div>
  )
}
