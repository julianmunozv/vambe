/*
 * Cuánto tarda cada etapa. Era una columna de la tabla que se eliminó, y es una
 * de las dos cosas que esta pantalla puede mostrar y el Resumen no.
 *
 * Merece un gráfico y no una columna porque lo que contesta es una pregunta de
 * forma, no una cifra: en qué parte del proceso el lead se queda quieto. Puesto
 * al lado de los saltos, el diagnóstico sale solo — la etapa más lenta y la que
 * más pierde son la misma, y eso no se ve mirando ninguna de las dos por
 * separado.
 *
 * LOS DÍAS NO SE SUMAN, y el pie lo dice. Cada cifra es el tiempo de un lead
 * DENTRO de la etapa; el total de punta a punta es el ciclo de venta. Sumar la
 * columna daría 35 días y no significaría nada: cada etapa se mide sobre una
 * población distinta y la mayoría de los leads nunca llega al final.
 *
 * Barras neutras a propósito: acá no hay categorías que distinguir, solo largos
 * que comparar. El único color se gasta en la etapa más lenta.
 */
import type { EtapaRow } from '../types'
import { dias1, n0 } from '../format'
import { useTooltip } from './Tooltip'

function Fila({ e, max, lenta }: { e: EtapaRow; max: number; lenta: boolean }) {
  const tip = useTooltip({
    titulo: e.etapa,
    filas: [
      ['Días típicos en la etapa', dias1(e.dias_mediana)],
      ['Leads que pasaron por acá', n0(e.alcanzaron)],
    ],
    texto: 'La mitad de los leads se mueve antes de ese plazo y la otra mitad después.',
    nota: lenta ? 'Es la etapa donde el lead se queda más tiempo quieto' : undefined,
  })
  const d = e.dias_mediana ?? 0
  return (
    <li {...tip} data-lenta={lenta ? 'si' : 'no'}>
      <span className="rotulo">{e.etapa}</span>
      <span className="pista">
        <i style={{ width: `${max ? Math.max(1.5, (100 * d) / max) : 0}%` }} />
      </span>
      <span className="valor num">{dias1(e.dias_mediana)}</span>
    </li>
  )
}

export function DiasEtapa({ etapas, ciclo }: { etapas: EtapaRow[]; ciclo: number | null }) {
  const con = etapas.filter((e) => e.dias_mediana !== null)
  if (!con.length) return <p className="vacio">Sin etapas en la selección.</p>
  const max = Math.max(...con.map((e) => e.dias_mediana ?? 0))
  /* Comparación estricta: con dos etapas empatadas gana la primera del embudo,
     así la misma selección siempre marca la misma fila. */
  const lenta = con.reduce((a, b) => ((b.dias_mediana ?? 0) > (a.dias_mediana ?? 0) ? b : a))

  return (
    <div className="bloque">
      <ul className="dias">
        {con.map((e) => <Fila key={e.etapa} e={e} max={max} lenta={e.etapa === lenta.etapa} />)}
      </ul>
      <p className="pie">
        No se suman: cada cifra es lo que el lead se queda dentro de esa etapa.
        {ciclo !== null && ` De punta a punta, una venta se cierra en ${dias1(ciclo)}.`}
      </p>
    </div>
  )
}
