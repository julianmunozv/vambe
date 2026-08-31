/*
 * EL RECORRIDO, SALTO POR SALTO. La tarjeta principal de Embudo.
 *
 * Reemplaza a dos bloques que decían lo mismo: el `Recorrido` del Resumen
 * repetido acá, y al lado una tabla cuyas dos primeras columnas eran ese mismo
 * gráfico escrito en números. Una pantalla de detalle no puede ser el titular
 * otra vez, así que acá está lo que el Resumen no muestra: CUÁNTOS leads deja
 * cada salto, no solo el porcentaje.
 *
 * Cada fila muestra una sola cosa: cuántos llegaron a esa etapa. La pérdida se
 * escribe aparte como comparación con la etapa anterior. Mezclar ambos valores
 * dentro de una misma barra obligaba a aprender una gramática distinta a la de
 * un embudo convencional.
 *
 * El rojo fuerte marca UN solo salto, el más caro. Pintar los seis en rojo pleno
 * dice que todo está roto: en un embudo perder gente es lo normal, y la tarjeta
 * tiene que señalar dónde se sale del patrón.
 */
import type { Paso, Salto } from '../kpis/panorama'
import { n0, pct1 } from '../format'
import { useTooltip } from './Tooltip'

function Fila({ p, esPeor }: { p: Paso; esPeor: boolean }) {
  const tip = useTooltip({
    titulo: p.rotulo,
    filas: [
      ['Leads que llegaron', n0(p.valor)],
      ['De los que entran al embudo', pct1(p.share)],
      ...(p.perdidos !== null && p.caida !== null
        ? ([
            ['Se perdieron antes de llegar', n0(p.perdidos)],
            ['De los que venían de la etapa anterior', pct1(p.caida)],
          ] as [string, string][])
        : []),
    ],
    nota: esPeor ? 'Es el salto donde se cae la mayor parte de los que venían' : undefined,
  })
  return (
    <li {...tip} data-venta={p.esVenta ? 'si' : 'no'} data-peor={esPeor ? 'si' : 'no'}>
      <span className="rotulo">{p.rotulo}</span>
      <span className="pista">
        {/* 1,5% de piso: un paso pequeño tiene que dejar rastro visible */}
        <i className="paso" style={{ width: `${Math.max(1.5, p.share)}%` }} />
      </span>
      <span className="valor num">{n0(p.valor)}</span>
      <span className="baja num">
        {p.perdidos === null ? '' : <>−{n0(p.perdidos)} <small>{pct1(p.caida)}</small></>}
      </span>
    </li>
  )
}

export function Saltos({ pasos, peor }: { pasos: Paso[]; peor: Salto | null }) {
  if (!pasos.length) return <p className="vacio">Sin leads en la selección.</p>
  return (
    <div className="bloque">
      <ul className="saltos">
        <li className="cabeza">
          <span className="rotulo">Etapa</span>
          <span className="pista" />
          <span className="valor">Llegaron</span>
          <span className="baja">Vs. anterior</span>
        </li>
        {pasos.map((p) => (
          <Fila key={p.rotulo} p={p} esPeor={!!peor && peor.hasta === p.rotulo} />
        ))}
      </ul>
      {peor && (
        <p className="pie">
          El salto más caro es de <b>{peor.desde}</b> a <b>{peor.hasta}</b>: se quedan en el camino{' '}
          {n0(peor.perdidos)} leads, {pct1(peor.caida)} de los que habían llegado.
        </p>
      )}
    </div>
  )
}
