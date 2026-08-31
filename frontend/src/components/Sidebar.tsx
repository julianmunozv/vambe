/*
 * El menú lateral: parte el panel en las preguntas que se hacen por separado.
 *
 * Antes era un solo scroll con nueve secciones del mismo peso, y encontrar el
 * embudo era recordar a qué altura estaba. Cada segmento ahora es una pantalla
 * y los filtros de arriba se mantienen al cambiar de una a otra — eso es lo que
 * permite seguir un hilo: filtrar por un canal en Adquisición y pasar a Embudo
 * con el filtro puesto.
 *
 * Los ítems son solo rótulo: la pregunta que contesta cada segmento se lee en la
 * cabecera al entrar, y repetirla acá hacía una columna de 252px de texto
 * compitiendo con los datos.
 */
import { SEGMENTOS } from '../segmentos'

export function Sidebar({ activo, onIr }: {
  activo: string
  onIr: (id: string) => void
}) {
  return (
    <nav className="lateral" aria-label="Segmentos del panel">
      <div className="marca">
        <span className="logo" aria-hidden="true">V</span>
        <span>
          <strong>Vambe Motors</strong>
          <em>Operación comercial</em>
        </span>
      </div>

      <ul className="menu">
        {SEGMENTOS.map((s) => (
          <li key={s.id} data-apoyo={s.apoyo ? 'si' : undefined}>
            <a href={`#/${s.id}`} aria-current={activo === s.id ? 'page' : undefined}
               onClick={() => onIr(s.id)}>
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <path d={s.icono} fill="none" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{s.rotulo}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
