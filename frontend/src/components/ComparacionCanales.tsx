/*
 * El ranking de canales por ventas, con su conversión al lado.
 *
 * El líder NO lleva píldora de «Más ventas»: la tarjeta vive en la columna
 * angosta, y esos 72px se los sacaba al nombre del canal —«Orgánico» salía
 * cortado en «Orgá…» y su volumen se partía en dos líneas—. Que sea el líder ya
 * lo dicen tres cosas: la frase de arriba, el puesto 1 y el fondo verde de la
 * fila.
 */
import type { CanalRow } from '../types'
import { n0, pct1 } from '../format'
import { canalColor, canalLabel } from '../theme'

export function ComparacionCanales({ canales }: { canales: CanalRow[] }) {
  const ordenados = canales
    .filter((c) => c.leads > 0)
    .sort((a, b) => b.ganados - a.ganados)

  if (!ordenados.length) return <p className="vacio">No hay canales en la selección.</p>

  const liderVentas = ordenados[0]!
  const mejorConversion = ordenados.reduce((a, b) =>
    (a.tasa_conversion ?? 0) >= (b.tasa_conversion ?? 0) ? a : b)
  const maxVentas = Math.max(...ordenados.map((c) => c.ganados), 1)
  const mismoLider = liderVentas.canal === mejorConversion.canal

  return (
    <div className="comparacion-canales">
      <p className="lectura-canal">
        <strong>{canalLabel(liderVentas.canal)} es el mejor canal por ventas:</strong>{' '}
        generó {n0(liderVentas.ganados)} ventas
        {mismoLider
          ? ` y también tiene la mejor conversión (${pct1(liderVentas.tasa_conversion)}).`
          : `. ${canalLabel(mejorConversion.canal)} tiene la mejor conversión (${pct1(mejorConversion.tasa_conversion)}).`}
      </p>

      <div className="cabecera-comparacion" aria-hidden="true">
        <span>Canal</span>
        <span>Ventas</span>
        <span>Conversión</span>
      </div>
      <ol>
        {ordenados.map((c, i) => (
          <li key={c.canal} data-lider={i === 0 ? 'si' : 'no'}>
            <div className="identidad-canal">
              <span className="puesto">{i + 1}</span>
              <i className="punto" style={{ background: canalColor(c.canal) }} />
              <span className="nombre-canal">
                <b>{canalLabel(c.canal)}</b>
                <small>{n0(c.leads)} leads</small>
              </span>
            </div>
            <div className="ventas-canal">
              <span className="pista">
                <i style={{
                  width: `${(100 * c.ganados) / maxVentas}%`,
                  background: canalColor(c.canal),
                }} />
              </span>
              <b className="num">{n0(c.ganados)}</b>
            </div>
            <strong className="conversion-canal num">{pct1(c.tasa_conversion)}</strong>
          </li>
        ))}
      </ol>
    </div>
  )
}
