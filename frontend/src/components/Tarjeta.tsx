/*
 * La tarjeta: título adentro, no un encabezado afuera.
 *
 * Antes cada bloque llevaba un <h2> de 18px y un párrafo de dos líneas ARRIBA de
 * la tarjeta. Eso convertía el panel en un documento: para ver tres cifras había
 * que leer seis líneas y bajar. Acá el título es de 13px, la explicación es una
 * línea, y las dos viven adentro — así entran tres tarjetas en el alto que antes
 * ocupaba una.
 *
 * `aside` es la esquina superior derecha: la cifra que resume la tarjeta, para
 * que se pueda leer sin mirar el gráfico.
 */
import type { ReactNode } from 'react'

export function Tarjeta({ titulo, nota, aside, accion, children, alto }: {
  titulo?: string
  nota?: string
  aside?: ReactNode
  accion?: { rotulo: string; onClick: () => void }
  children: ReactNode
  /** Estira la tarjeta al alto de su fila; para que una rejilla quede pareja. */
  alto?: boolean
}) {
  return (
    <section className="tarjeta" data-alto={alto ? 'si' : undefined}>
      {(titulo || aside || accion) && (
        <header>
          <div className="rotulos">
            {titulo && <h2>{titulo}</h2>}
            {nota && <p>{nota}</p>}
          </div>
          {aside && <div className="aparte">{aside}</div>}
          {accion && (
            <button type="button" className="accion-tarjeta" onClick={accion.onClick}>
              {accion.rotulo} →
            </button>
          )}
        </header>
      )}
      <div className="cuerpo">{children}</div>
    </section>
  )
}

/** Una cifra de esquina: rótulo pequeño arriba, valor y variación abajo.
 *
 * El rótulo acepta un nodo y no solo un string para que una cifra que ES una
 * métrica del catálogo entre con su `Rotulo` —y con su definición al apuntarla—
 * en vez de con un nombre escrito a mano acá. */
export function Resalte({ rotulo, valor, badge }: {
  rotulo: ReactNode; valor: string; badge?: ReactNode
}) {
  return (
    <div className="resalte">
      <span className="rotulo">{rotulo}</span>
      <span className="linea">
        <b className="num">{valor}</b>
        {badge}
      </span>
    </div>
  )
}
