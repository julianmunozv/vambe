/*
 * Tabla de datos.
 *
 * No es un accesorio de los gráficos: la paleta de series tiene dos colores bajo
 * 3:1 de contraste, y la regla es que todo gráfico que los use lleve etiqueta
 * directa visible o tabla al lado. Acá está la tabla.
 *
 * Una columna puede declarar de qué MÉTRICA es (`metrica`), y entonces su
 * encabezado queda definido: apuntarlo dice qué mide y dónde se calcula. Esa es
 * la diferencia entre una tabla que se lee y una que se interpreta.
 *
 * Y puede declarar su `pie`: la cifra del conjunto para esa columna. Cuando la
 * tabla ES el segmento —una fila por persona, sin gráficos al lado— la vara
 * tiene que estar en la misma columna que la cifra que se compara: un promedio
 * escrito en el encabezado de la tarjeta obliga a recordar un número mientras se
 * recorren nueve columnas. El pie aparece solo si alguna columna lo declara.
 *
 * GRUPOS. Con nueve columnas seguidas todas pesan lo mismo y no hay por dónde
 * entrar: se leen de izquierda a derecha como una planilla. `grupo` junta las
 * columnas que responden la misma pregunta y dibuja una fila de encabezado
 * arriba con una línea vertical donde empieza cada bloque. Es la jerarquía que
 * convierte «nueve columnas» en «tres preguntas»; en Equipo son cierra,
 * responde y sostiene.
 *
 * ORDEN. Una columna que declara `orden` se puede ordenar haciendo clic en su
 * encabezado. Es CONTROLADO desde la página y no estado interno: el orden con el
 * que abre una tarjeta es una decisión editorial —en Equipo, la única columna
 * donde todos reciben el mismo tipo de lead— y esa decisión se declara donde se
 * arman las columnas, no adentro de un componente genérico. Sin `onOrden`, la
 * tabla no es ordenable y los encabezados quedan como texto: Embudo no necesita
 * ordenarse y no paga controles que no usa.
 *
 * La tabla dice sola por dónde está ordenada —la flecha del encabezado activo y
 * su `aria-sort`— y no hace falta una línea de texto abajo repitiéndolo.
 *
 * El encabezado ordenable es UN solo elemento enfocable: el botón lleva también
 * los handlers del globo, así que apuntarlo sigue explicando qué mide la columna
 * y no hay un `span` con `tabIndex` metido adentro de un `button`.
 *
 * BARRAS EN LA CELDA. `barra` dibuja un hilo de 3px bajo el número, a escala del
 * máximo de esa columna sobre las filas visibles. NO es el ranking dibujado
 * aparte —eso ya se sacó del panel una vez, y con razón: una barra al lado de la
 * tabla obliga a cruzar dos bloques para armar una conversación con alguien—.
 * Acá la barra vive DENTRO de la celda de la persona, así que no agrega un
 * bloque ni una lectura: solo hace que el orden se vea sin leer ocho cifras.
 * Va únicamente en las columnas `destacada`, que son las que contestan la
 * pregunta del segmento.
 *
 * El hilo se dibuja como hermano del contenido y no envolviéndolo, sobre una
 * pista de ancho FIJO anclada al borde derecho de la celda, y crece de izquierda
 * a derecha desde el arranque de esa pista. Envolviendo el contenido, la pista
 * medía lo que midiera el texto de cada fila: «11,9% · 239» y «19,0% · 1.106»
 * daban pistas de ancho distinto y los largos dejaban de ser comparables, que es
 * lo único que el hilo viene a hacer.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ClaveMetrica } from '../kpis/catalogo'
import { met } from '../kpis/catalogo'
import { useTooltip } from './Tooltip'

/** Por qué columna y en qué sentido está ordenada la tabla. */
export interface Orden {
  clave: string
  dir: 'asc' | 'desc'
}

export interface Columna<T> {
  clave: string
  /** Título propio. Si se omite, se usa el nombre de la métrica del catálogo. */
  titulo?: string
  /** La métrica del catálogo que muestra la columna, si es una de ellas. */
  metrica?: ClaveMetrica
  /** La pregunta que responde la columna. Las columnas contiguas que comparten
   *  `grupo` quedan bajo un mismo encabezado y separadas de las demás. */
  grupo?: string
  /** La columna que responde la pregunta de la sección; va en peso 500. */
  destacada?: boolean
  /** La que está a la vista como contexto y no como veredicto: va apagada. */
  apagada?: boolean
  /** El valor por el que ordena esta columna. Se ordena por el número CRUDO y no
   *  por lo que dice la celda: dos filas que se muestran «4,5%» son 4,52 y 4,47,
   *  y ordenar por el texto formateado las deja empatadas y en cualquier orden.
   *  Sin esto, la columna no es ordenable. */
  orden?: (fila: T) => number | string | null
  /** Valor a dibujar como hilo bajo el número, escalado al máximo de la columna.
   *  null en una fila la deja sin barra, que es lo correcto para un dato que no
   *  existe: una barra en cero se lee como una medición de cero. */
  barra?: (fila: T) => number | null
  /** La cifra de la columna para el conjunto: la vara de cada fila. */
  pie?: ReactNode
  celda: (fila: T) => ReactNode
}

/** Las clases de una celda. `grupo-inicio` pinta la línea vertical que abre un
 *  bloque de columnas; la lleva la primera columna de cada grupo salvo la que
 *  abre la tabla, que ya tiene el borde de la tarjeta a su izquierda. */
const clases = <T,>(c: Columna<T>, cs: Columna<T>[], i: number): string => [
  'num',
  c.destacada ? 'destacado' : '',
  c.apagada ? 'apagado' : '',
  i > 0 && c.grupo !== cs[i - 1]!.grupo ? 'grupo-inicio' : '',
].filter(Boolean).join(' ')

/** Los tramos de encabezado de grupo: uno por corrida de columnas contiguas que
 *  comparten `grupo`. Las columnas sin grupo producen un tramo vacío, que es lo
 *  que deja al nombre de la persona sin rótulo encima. */
function tramos<T>(cs: Columna<T>[]): { clave: string; titulo?: string; span: number }[] {
  const out: { clave: string; titulo?: string; span: number }[] = []
  cs.forEach((c, i) => {
    const previo = out[out.length - 1]
    if (i > 0 && previo && c.grupo === cs[i - 1]!.grupo) previo.span += 1
    else out.push({ clave: c.clave, titulo: c.grupo, span: 1 })
  })
  return out
}

/** El máximo de la columna sobre las filas visibles: con un filtro puesto, la
 *  barra tiene que escalarse contra lo que se está viendo y no contra el total
 *  del período — si no, todas las barras se achican juntas y el orden deja de
 *  verse justo cuando queda menos gente que comparar. */
const maximo = <T,>(c: Columna<T>, filas: T[]): number =>
  Math.max(...filas.map((f) => c.barra?.(f) ?? 0), 0)

/** El rótulo visible de una columna. */
const rotuloColumna = <T,>(c: Columna<T>): string =>
  c.titulo ?? (c.metrica ? met(c.metrica).nombre : c.clave)

/**
 * El sentido con el que se ordena una columna al primer clic: las cifras
 * arrancan de mayor a menor y los textos de la A a la Z. Nadie hace clic en
 * «Conv. en pagado» para ver primero al que peor cierra, ni en «Vendedor» para
 * empezar por la Z.
 */
const primerSentido = <T,>(c: Columna<T>, filas: T[]): 'asc' | 'desc' => {
  const v = filas.map((f) => c.orden?.(f)).find((x) => x !== null && x !== undefined)
  return typeof v === 'string' ? 'asc' : 'desc'
}

function Encabezado<T>({ col, activo, onClick }: {
  col: Columna<T>
  activo: Orden | null
  onClick: (() => void) | null
}) {
  const m = col.metrica ? met(col.metrica) : null
  /* El hook va siempre, ordenable o no: los handlers se cuelgan solo si la
     columna es una métrica del catálogo y por lo tanto tiene qué explicar. */
  const tip = useTooltip({ titulo: m?.nombre ?? '', texto: m?.definicion, filas: [] })
  const texto = rotuloColumna(col)

  if (!onClick) {
    if (!m) return <>{texto}</>
    return <span {...tip} className={`definible ${tip.className}`} tabIndex={0}>{texto}</span>
  }
  return (
    <button type="button" {...(m ? tip : {})} onClick={onClick}
            className={`orden-col ${m ? tip.className : ''}`}
            title={`Ordenar por ${texto}`}>
      {/* El punteado va en el texto y no en el botón: aplicado al botón,
          subrayaría también la flecha y no hay forma de quitárselo al hijo. */}
      <span className={m ? 'definible' : undefined}>{texto}</span>
      {/* La flecha se dibuja SIEMPRE, transparente cuando la columna no es la
          activa: apareciendo y desapareciendo movería el ancho de la columna en
          cada clic, y el ojo perdería la fila que venía siguiendo. */}
      <span className="flecha" aria-hidden="true">
        {activo?.dir === 'asc' ? '↑' : '↓'}
      </span>
    </button>
  )
}

export function DataTable<T>({ columnas, filas, claveFila, orden, onOrden }: {
  columnas: Columna<T>[]
  filas: T[]
  claveFila: (fila: T) => string
  /** El orden activo. Sin `onOrden`, es solo el orden con el que llegan. */
  orden?: Orden | null
  /** Recibe el orden que sigue al clic. Su ausencia apaga el ordenamiento. */
  onOrden?: (o: Orden) => void
}) {
  const conPie = columnas.some((c) => c.pie !== undefined)
  const conGrupos = columnas.some((c) => c.grupo !== undefined)
  const maximos = columnas.map((c) => (c.barra ? maximo(c, filas) : 0))

  const ordenadas = useMemo(() => {
    const col = orden ? columnas.find((c) => c.clave === orden.clave) : undefined
    const valor = col?.orden
    if (!orden || !valor) return filas
    const signo = orden.dir === 'asc' ? 1 : -1
    /* Desempate explícito por la clave de la fila. Con `sort` estable el empate
       conserva el orden de entrada, que es el `ORDER BY` del API: dos filas
       empatadas cambiarían de lugar según cómo vino la respuesta, y la misma
       pantalla se vería distinta entre dos cargas. */
    const desempate = (a: T, b: T) => claveFila(a).localeCompare(claveFila(b), 'es')
    return [...filas].sort((a, b) => {
      const [x, y] = [valor(a), valor(b)]
      /* Los vacíos van al final SIEMPRE, en los dos sentidos: un «—» arriba de
         un orden «de mayor a menor» se lee como el valor más alto. */
      if (x === null || x === undefined) return (y === null || y === undefined) ? desempate(a, b) : 1
      if (y === null || y === undefined) return -1
      const c = typeof x === 'string' || typeof y === 'string'
        ? String(x).localeCompare(String(y), 'es')
        : x - y
      return c !== 0 ? signo * c : desempate(a, b)
    })
  }, [filas, columnas, orden, claveFila])

  if (!filas.length) return <p className="vacio">Sin datos en la selección.</p>

  /** El clic en un encabezado: la misma columna invierte el sentido, otra
   *  columna arranca en el suyo. */
  const alOrdenar = (c: Columna<T>) => {
    if (!onOrden) return
    if (orden?.clave === c.clave) onOrden({ clave: c.clave, dir: orden.dir === 'asc' ? 'desc' : 'asc' })
    else onOrden({ clave: c.clave, dir: primerSentido(c, filas) })
  }

  /** El ancho de la pista del hilo, en px. Fijo y no relativo al contenido: el
   *  largo de dos hilos solo se compara si arrancan del mismo lugar. */
  const PISTA = 56

  /** El hilo de una celda, o null si esa fila no tiene qué dibujar. Devuelve
   *  null —y no un hilo de ancho cero— cuando el valor falta: con el filtro por
   *  canal orgánico, «Conv. en pagado» queda en «—» para las ocho personas, y
   *  una pista gris debajo de una raya se lee como una medición en cero. */
  const hilo = (c: Columna<T>, f: T, i: number): ReactNode => {
    const v = c.barra?.(f)
    if (v === undefined || v === null || !maximos[i]) return null
    const ancho = PISTA * Math.min(1, v / maximos[i]!)
    /* La última columna no lleva padding derecho (la tabla cierra contra el borde
       de la tarjeta), así que su pista arranca 10px más a la derecha. */
    const margen = i === columnas.length - 1 ? 0 : 10
    /* El `right` se calcula y no se hereda del CSS: fijando solo el ancho, el
       hilo crecería hacia la izquierda desde el final de la pista, y el ojo
       compararía bordes que se mueven en vez de largos que arrancan parejos. */
    return <i className="hilo"
               style={{ width: `${ancho.toFixed(1)}px`, right: `${margen + PISTA - ancho}px` }} />
  }

  return (
    <div className="envoltura">
      <table className="datos">
        <thead>
          {conGrupos && (
            <tr className="grupos">
              {tramos(columnas).map((t) => (
                <th key={t.clave} colSpan={t.span} scope="colgroup"
                    className={t.titulo ? 'grupo-inicio' : undefined}>{t.titulo}</th>
              ))}
            </tr>
          )}
          <tr>
            {columnas.map((c, i) => {
              const activo = orden?.clave === c.clave ? orden : null
              const ordenable = Boolean(onOrden && c.orden)
              return (
                <th key={c.clave} scope="col" className={clases(c, columnas, i)}
                    data-ordenable={ordenable ? 'si' : undefined}
                    aria-sort={activo ? (activo.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <Encabezado col={c} activo={activo}
                              onClick={ordenable ? () => alOrdenar(c) : null} />
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr key={claveFila(f)}>
              {columnas.map((c, i) => {
                const barra = hilo(c, f, i)
                return (
                  <td key={c.clave}
                      className={`${clases(c, columnas, i)}${barra ? ' con-hilo' : ''}`}>
                    {c.celda(f)}
                    {barra}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {conPie && (
          <tfoot>
            <tr>
              {columnas.map((c, i) => (
                <td key={c.clave} className={clases(c, columnas, i)}>{c.pie}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
