/*
 * Las tres conclusiones, arriba de todo lo demás.
 *
 * Las reglas que las producen viven en kpis/hallazgos.ts, no acá: tienen
 * umbrales discutibles y esos umbrales tienen que poder cambiarse sin abrir un
 * archivo de UI. Este componente solo las pinta y ofrece el salto al segmento
 * donde se sigue el hilo.
 */
import type { Dashboard } from '../types'
import { hallazgos } from '../kpis/hallazgos'
import { SEGMENTOS } from '../segmentos'

const rotulo = (id: string): string =>
  SEGMENTOS.find((s) => s.id === id)?.rotulo ?? id

export function Findings({ d, onIr, apilados }: {
  d: Dashboard; onIr: (id: string) => void; apilados?: boolean
}) {
  const cards = hallazgos(d)
  if (!cards.length) return <p className="vacio">La selección es muy chica para sacar conclusiones.</p>
  return (
    <div className={apilados ? 'hallazgos apilados' : 'rejilla c3 hallazgos'}>
      {cards.map((c) => (
        <article className="hallazgo" key={c.cinta}>
          <div className="alto">
            <span className="cinta">
              <i className="punto" style={{ background: `var(--${c.color})` }} />{c.cinta}
            </span>
            <span className="cifra num">{c.cifra}</span>
          </div>
          <h3>{c.titulo}</h3>
          {/* El detalle de apoyo se omite en la versión apilada del resumen: el
              titular ya trae la cifra y la afirmación, y la evidencia completa
              está en el segmento al que lleva el enlace. */}
          {!apilados && <p>{c.cuerpo}</p>}
          <div className="accion">{c.accion}</div>
          <a className="salto" href={`#/${c.ir}`} onClick={() => onIr(c.ir)}>
            Ver {rotulo(c.ir).toLowerCase()} →
          </a>
        </article>
      ))}
    </div>
  )
}
