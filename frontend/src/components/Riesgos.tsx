/*
 * Lo que hay que arreglar, en tres números.
 *
 * Un riesgo que no aplica a la selección no aparece — una tarjeta en cero se lee
 * como «esto está resuelto», que es lo contrario de lo que significa cuando el
 * filtro simplemente la dejó sin población.
 */
import type { Riesgo } from '../kpis/panorama'

export function Riesgos({ riesgos }: { riesgos: Riesgo[] }) {
  if (!riesgos.length) return <p className="vacio">Sin riesgos medibles en la selección.</p>
  return (
    <div className="riesgos">
      {riesgos.map((r) => (
        <div className="riesgo" key={r.id} data-nivel={r.nivel}>
          <div className="valor num">{r.valor}</div>
          <div className="rotulo">{r.rotulo}</div>
          <div className="detalle">{r.detalle}</div>
        </div>
      ))}
    </div>
  )
}
