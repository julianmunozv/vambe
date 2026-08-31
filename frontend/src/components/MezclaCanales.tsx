/*
 * Participación de cada canal en el volumen, y su resultado al lado.
 *
 * UN ANILLO, el de leads: la parte que cada canal aporta al total de entradas.
 * El anillo muestra la parte sobre el total de un vistazo, y para eso alcanza;
 * comparar 24% contra 27% adentro de un anillo es imposible, así que las cifras
 * exactas —incluida la parte de las VENTAS de cada canal y su conversión— siguen
 * abajo en la tabla, que es también la leyenda del gráfico. Cuatro segmentos es
 * el techo con el que un anillo se lee: si algún día hay más canales, esto
 * vuelve a ser una barra apilada.
 *
 * Las etiquetas van AFUERA del anillo, en tinta y no en el color de la serie:
 * el amarillo y el aqua de la paleta quedan bajo 3:1 contra el blanco, así que
 * una cifra escrita adentro del segmento es ilegible justo en el canal que más
 * importa. El color lo lleva la marca, nunca el texto.
 */
import type { CanalRow } from '../types'
import { n0, pct1 } from '../format'
import { canalColor, canalLabel } from '../theme'
import { useTooltip } from './Tooltip'

/* Este viewBox NO se estira al ancho de la tarjeta: un anillo escalado a 952px
   de ancho pediría 470px de alto y sería la mitad de la pantalla. El SVG queda
   en su tamaño natural —470 × 232, dentro de los 210-240 de alto de la regla— y
   centrado; el tope está en `.mezcla .donas`. */
const ANCHO = 470, ALTO = 232
const CX = ANCHO / 2, CY = 116
const R_EXT = 84, R_INT = 52
const R_MEDIO = (R_EXT + R_INT) / 2
const GROSOR = R_EXT - R_INT
/* El separador entre segmentos es aire del color de la superficie, no un borde:
   2px medidos sobre el radio medio, convertidos a ángulo. */
const SEPARACION = 2 / R_MEDIO
/* Bajo esta parte la etiqueta se superpone con la de al lado; el dato queda en
   la tabla y en el globo. */
const MINIMO_ETIQUETA = 4

interface CanalComparado extends CanalRow {
  shareLeads: number
  shareVentas: number
}

const punto = (r: number, a: number): [number, number] =>
  [CX + r * Math.sin(a), CY - r * Math.cos(a)]

/** Arco sobre el radio medio: el grosor lo pone el ancho del trazo. */
function arco(desde: number, hasta: number): string {
  const [x0, y0] = punto(R_MEDIO, desde)
  const [x1, y1] = punto(R_MEDIO, hasta)
  const largo = hasta - desde > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${R_MEDIO} ${R_MEDIO} 0 ${largo} 1 ${x1} ${y1}`
}

function Segmento({ canal, desde, hasta }: {
  canal: CanalComparado; desde: number; hasta: number
}) {
  const tip = useTooltip({
    titulo: canalLabel(canal.canal),
    filas: [
      ['Leads', n0(canal.leads)],
      ['Participación en leads', pct1(canal.shareLeads)],
      ['Ventas', n0(canal.ganados)],
      ['Participación en ventas', pct1(canal.shareVentas)],
      ['Conversión', pct1(canal.tasa_conversion)],
    ],
  })
  const hueco = Math.min(SEPARACION / 2, (hasta - desde) / 4)
  /* Un solo canal en la selección no puede dibujarse como arco: un arco de 360°
     tiene el mismo punto de partida y de llegada y no pinta nada. */
  const completo = canal.shareLeads >= 99.99
  return (
    <g {...tip} aria-label={`${canalLabel(canal.canal)}: ${pct1(canal.shareLeads)}`}>
      {completo
        ? <circle cx={CX} cy={CY} r={R_MEDIO} fill="none"
                  stroke={canalColor(canal.canal)} strokeWidth={GROSOR} />
        : <path d={arco(desde + hueco, hasta - hueco)} fill="none"
                stroke={canalColor(canal.canal)} strokeWidth={GROSOR} strokeLinecap="butt" />}
    </g>
  )
}

export function MezclaCanales({ mezcla }: { mezcla: (CanalRow & { share: number })[] }) {
  const base = mezcla.filter((c) => c.leads > 0)
  if (!base.length) return <p className="vacio">Sin canales en la selección.</p>
  const totalLeads = base.reduce((s, c) => s + c.leads, 0)
  const totalVentas = base.reduce((s, c) => s + c.ganados, 0)
  const cs: CanalComparado[] = base.map((c) => ({
    ...c,
    shareLeads: totalLeads ? (100 * c.leads) / totalLeads : 0,
    shareVentas: totalVentas ? (100 * c.ganados) / totalVentas : 0,
  }))
  const mayorDesbalance = cs.reduce((a, b) =>
    Math.abs(a.shareVentas - a.shareLeads) >= Math.abs(b.shareVentas - b.shareLeads) ? a : b)

  let acumulado = 0
  const sectores = cs.filter((c) => c.shareLeads > 0).map((c) => {
    const desde = (2 * Math.PI * acumulado) / 100
    acumulado += c.shareLeads
    return { c, desde, hasta: (2 * Math.PI * acumulado) / 100 }
  })

  return (
    <div className="mezcla">
      <svg className="donas" viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%"
           preserveAspectRatio="xMinYMin meet" role="img"
           aria-label="Participación de cada canal en los leads que entraron">
        <circle cx={CX} cy={CY} r={R_MEDIO} fill="none" stroke="var(--hundido)" strokeWidth={GROSOR} />
        {sectores.map(({ c, desde, hasta }) => (
          <Segmento key={c.canal} canal={c} desde={desde} hasta={hasta} />
        ))}

        <text x={CX} y={CY - 4} textAnchor="middle" className="etiq">Leads</text>
        <text x={CX} y={CY + 20} textAnchor="middle" className="dona-total">{n0(totalLeads)}</text>

        {sectores.filter(({ c }) => c.shareLeads >= MINIMO_ETIQUETA).map(({ c, desde, hasta }) => {
          const medio = (desde + hasta) / 2
          const [x, y] = punto(R_EXT + 14, medio)
          const seno = Math.sin(medio)
          const ancla = Math.abs(seno) < 0.25 ? 'middle' : seno > 0 ? 'start' : 'end'
          return (
            <text key={`r-${c.canal}`} x={x} y={y + 4} textAnchor={ancla} className="etiq">
              {canalLabel(c.canal)} <tspan className="dato">{c.shareLeads.toFixed(0)}%</tspan>
            </text>
          )
        })}
      </svg>

      <div className="encabezados-canales" aria-hidden="true">
        <span /><span>Canal</span><span>% leads</span><span>% ventas</span><span>Conversión</span>
      </div>
      <ul className="detalle-canales">
        {cs.map((c) => (
          <li key={c.canal}>
            <i className="marca-serie" style={{ background: canalColor(c.canal) }} />
            <span className="nombre">{canalLabel(c.canal)}</span>
            <span className="cuota num">{pct1(c.shareLeads)}</span>
            <span className="cuota num" data-balance={c.shareVentas >= c.shareLeads ? 'positivo' : 'negativo'}>
              {pct1(c.shareVentas)}
            </span>
            <span className="conv num">{pct1(c.tasa_conversion)}</span>
          </li>
        ))}
      </ul>
      <p className="pie-nota">
        {canalLabel(mayorDesbalance.canal)} concentra {pct1(mayorDesbalance.shareLeads)} de los leads
        y {pct1(mayorDesbalance.shareVentas)} de las ventas.
      </p>
    </div>
  )
}
