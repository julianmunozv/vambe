/*
 * Cómo se mueve cada canal, mes a mes.
 *
 * El agregado de `canales` da una sola tasa por canal, y ninguna decisión de
 * presupuesto se toma sobre el promedio de doce meses. La pantalla no tenía
 * ninguna vista con el tiempo adentro de un canal, y esta es la razón de existir
 * de este gráfico.
 *
 * La serie es la de la VENTANA —las ventas ocurridas dentro de los primeros N
 * días de cada lead—, la misma medida que `ConversionChart` y por la misma
 * razón: sobre el acumulado, los meses recientes están incompletos y las cuatro
 * líneas caen juntas por la edad de las cohortes. Medido: con el acumulado el
 * canal pagado «se derrumbaba» de 7,2% (jul 2025) a 2,2% (abr 2026), y dentro de
 * la ventana esos dos meses son 1,2% y 0,8% — la mitad de esa caída era tiempo
 * que a los meses nuevos todavía les falta.
 *
 * Cuatro decisiones que lo hacen legible:
 *
 *  1. EL EJE ARRANCA EN CERO, al revés que `ConversionChart`. Allá se compara un
 *     mes contra otro y el rango real es de tres puntos, así que el cero aplasta
 *     la señal. Acá se comparan canales entre sí y el mejor rinde veinte veces
 *     el peor: con un eje recortado esa proporción —que es TODO el hallazgo— se
 *     lee como una diferencia menor.
 *  2. Los botones son selector y leyenda a la vez: permiten superponer solo los
 *     canales que el lector quiere comparar y mantienen el color estable.
 *  3. LOS MESES QUE NO CUMPLIERON LA VENTANA NO SE DIBUJAN. Igual que en la
 *     serie de cohortes: a esos meses les falta parte de su propia ventana, así
 *     que su cifra todavía va a subir y ponerla en la línea inventa un derrumbe
 *     simultáneo en los cuatro canales.
 *  4. El volumen va abajo, en GRIS, no en color de serie. Es el contexto de la
 *     medición, no una quinta serie: darle un color categórico lo pondría a
 *     competir con las líneas y obligaría a revalidar la paleta para daltonismo.
 *     Va como total del mes porque la pregunta que contesta es «¿subimos el
 *     volumen justo cuando la tasa caía?», no de quién era cada lead — eso está
 *     en la tabla de abajo.
 */
import { useState } from 'react'
import type { CanalMesRow } from '../types'
import { mesCorto, mesLargo, n0, pct1 } from '../format'
import { canalColor, canalLabel } from '../theme'
import { useTooltip } from './Tooltip'

/* viewBox calibrado a la tarjeta de 2fr donde vive (915px de ancho útil medidos):
   915 × 224/880 = 233px de alto renderizado, dentro de los 210-240 de la regla.
   Mover el gráfico a una tarjeta de otro ancho obliga a recalcular ALTO: el alto
   renderizado lo decide la proporción del viewBox y nada más. */
const ANCHO = 880, ALTO = 224
const IZQ = 38, DER = 40, ARRIBA = 26
const ALTO_LINEA = 118
const BASE_LINEA = ARRIBA + ALTO_LINEA
const TOPE_VOL = BASE_LINEA + 14
const ALTO_VOL = 38
const BASE_VOL = TOPE_VOL + ALTO_VOL
/* Tope del ancho de la barra de volumen: sin él la barra crece con la columna
   del mes y termina siendo un bloque. El volumen es el contexto de la medición,
   no la marca que manda. */
const ANCHO_VOL = 34

interface Mes {
  mes: string
  medible: boolean
  leads: number
}

interface Serie {
  canal: string
  leads: number
  /** Una entrada por mes, alineada con `meses`. null = el canal no tuvo leads. */
  puntos: (number | null)[]
  volumenes: number[]
}

/**
 * Topes redondos y cuatro marcas. Se toma el primer paso de la escala 1-2-5 que
 * deje el eje en cuatro tramos: un eje que dice 8,97% obliga a leer el número.
 */
function escala(max: number): { hi: number; paso: number } {
  const bruto = Math.max(max, 1) / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= bruto) ?? 10 * mag
  return { hi: Math.max(paso, Math.ceil(max / paso) * paso), paso }
}

/* La zona sensible es la columna entera del mes y no el punto de la línea. */
function Columna({ m, filas, x, ancho, ventanaDias }: {
  m: Mes; filas: [string, string][]; x: number; ancho: number; ventanaDias: number
}) {
  const tip = useTooltip({
    titulo: mesLargo(m.mes),
    /* `texto` existe justo para esto: acá lo que falta no es el dato sino qué
       mide. Un globo que dice «Meta Ads 1,2%» deja al lector adivinando de qué
       es ese porcentaje —y con la tarjeta de al lado diciendo 4,5% del mismo
       canal, lo más probable es que adivine mal. */
    texto: `Leads que entraron ese mes y compraron dentro de ${ventanaDias} días.`,
    filas,
    nota: m.medible ? undefined
      : 'Entró hace poco: a sus leads todavía les faltan días de la ventana con la que se '
        + 'mide a los demás meses, así que su cifra va a subir.',
  })
  return (
    <g {...tip}>
      <rect x={x} y={ARRIBA} width={ancho} height={BASE_VOL - ARRIBA} fill="transparent" />
    </g>
  )
}

export function TendenciaCanales({ filas, ventanaDias }: {
  filas: CanalMesRow[]
  /** Los días dentro de los que se cuenta la venta. Se nombra en pantalla. */
  ventanaDias: number
}) {
  const [elegidos, setElegidos] = useState<string[]>([])
  if (!filas.length) return <p className="vacio">Sin datos en la selección.</p>

  /* El eje X sale de las filas, no de una lista fija: bajo un filtro de meses la
     serie tiene que empezar y terminar donde el filtro dice. */
  const porMes = new Map<string, Mes>()
  for (const f of filas) {
    const m = porMes.get(f.mes) ?? { mes: f.mes, medible: f.medible, leads: 0 }
    m.leads += f.leads
    porMes.set(f.mes, m)
  }
  const meses = [...porMes.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1))
  const idx = new Map(meses.map((m, i) => [m.mes, i]))

  const porCanal = new Map<string, Serie>()
  for (const f of filas) {
    let s = porCanal.get(f.canal)
    if (!s) porCanal.set(f.canal, (s = {
      canal: f.canal, leads: 0,
      puntos: meses.map(() => null), volumenes: meses.map(() => 0),
    }))
    s.leads += f.leads
    s.puntos[idx.get(f.mes)!] = f.tasa_ventana
    s.volumenes[idx.get(f.mes)!] = f.leads
  }
  /* Ordenadas por volumen: es el mismo orden de la tabla y de la mezcla, y el
     color sigue al canal, así que nunca cambia de significado. */
  const series = [...porCanal.values()].sort((a, b) => b.leads - a.leads)
  /* La selección vacía significa «el canal de mayor volumen». Si un filtro deja
     afuera canales elegidos, se conservan los que sigan disponibles; si no
     queda ninguno, la vista vuelve al primero. */
  const disponibles = new Set(series.map((s) => s.canal))
  const validos = elegidos.filter((c) => disponibles.has(c))
  const activas = validos.length
    ? series.filter((s) => validos.includes(s.canal))
    : [series[0]!]

  const alternar = (canal: string) => {
    const actuales = activas.map((s) => s.canal)
    if (actuales.includes(canal)) {
      if (actuales.length > 1) setElegidos(actuales.filter((c) => c !== canal))
      return
    }
    setElegidos([...actuales, canal])
  }

  const medibles = meses.map((m, i) => (m.medible ? i : -1)).filter((i) => i >= 0)
  if (medibles.length < 2) {
    return <p className="vacio">Se necesitan al menos dos meses comparables para ver la serie.</p>
  }
  const tasas = activas
    .flatMap((s) => medibles.map((i) => s.puntos[i]))
    .filter((t): t is number => t !== null)
  if (tasas.length < 2) {
    return <p className="vacio">La selección no tiene dos meses comparables.</p>
  }
  const { hi, paso } = escala(Math.max(...tasas))
  const volumenes = meses.map((_, i) =>
    activas.reduce((total, s) => total + s.volumenes[i]!, 0))
  const maxLeads = Math.max(...volumenes)

  const px = (i: number): number =>
    meses.length === 1 ? IZQ : IZQ + ((ANCHO - IZQ - DER) * i) / (meses.length - 1)
  const py = (v: number): number => BASE_LINEA - (ALTO_LINEA * v) / hi
  const anchoPaso = meses.length === 1 ? ANCHO - IZQ - DER : (ANCHO - IZQ - DER) / (meses.length - 1)

  const ticks: number[] = []
  for (let v = 0; v <= hi + 0.001; v += paso) ticks.push(Math.round(v * 10) / 10)

  const iSin = meses.findIndex((m) => !m.medible)

  const nombres = activas.map((s) => canalLabel(s.canal))

  return (
    <figure className="apretada">
      <div className="selector-series" aria-label="Canales mostrados">
        {series.map((s) => (
          <button key={s.canal} type="button" aria-pressed={activas.some((a) => a.canal === s.canal)}
                  onClick={() => alternar(s.canal)}>
            <i className="marca-serie" style={{ background: canalColor(s.canal) }} />
            {canalLabel(s.canal)}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" preserveAspectRatio="xMinYMin meet" role="img"
           aria-label={`Conversión en los primeros ${ventanaDias} días para ${nombres.join(', ')}, con su volumen mensual combinado`}>
        {/* Los meses a los que les falta ventana: la zona se apaga y lo dice.
            Cubre los DOS paneles, porque el volumen de esos meses sí es
            definitivo pero su tasa no, y separarlos haría pensar que solo una
            parte está en duda. */}
        {iSin >= 0 && (
          <g>
            <rect x={px(iSin) - anchoPaso / 2} y={ARRIBA - 6}
                  width={ANCHO - DER - (px(iSin) - anchoPaso / 2)}
                  height={BASE_VOL - ARRIBA + 6} fill="var(--hundido)" rx={4} />
            {/* El rótulo va ARRIBA de la banda y no adentro: con un solo mes sin
                ventana la banda mide media columna y cualquier texto adentro se
                desborda sobre la serie. Acá el margen superior está vacío. */}
            <text x={ANCHO - DER} y={ARRIBA - 13} textAnchor="end" fill="var(--ink-2)"
                  fontSize={11.5} fontWeight={500}>Aún sin sus {ventanaDias} días</text>
          </g>
        )}

        {/* El eje de abajo se llama «leads» y el de arriba no se llamaba nada: un
            «1,2%» suelto no dice de qué es porcentaje, y la tarjeta de al lado
            publica OTRA conversión del mismo canal (4,5%, la de cualquier
            fecha). El rótulo se arma con `ventanaDias` y no con el nombre del
            catálogo —que lleva el 30 escrito— para que no pueda contradecir a la
            banda de meses incompletos si algún día cambia la ventana. */}
        <text x={IZQ} y={ARRIBA - 13}>Conversión a {ventanaDias} días</text>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={IZQ} y1={py(v)} x2={ANCHO - DER} y2={py(v)} className="reja" />
            <text x={IZQ - 8} y={py(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}

        {/* volumen: total de leads del mes, en gris de contexto */}
        <text x={IZQ - 8} y={TOPE_VOL + 10} textAnchor="end">leads</text>
        {meses.map((m, i) => {
          const h = maxLeads ? (ALTO_VOL * volumenes[i]!) / maxLeads : 0
          const w = Math.min(anchoPaso * 0.6, ANCHO_VOL)
          return (
            <rect key={m.mes} x={px(i) - w / 2} y={BASE_VOL - h}
                  width={w} height={Math.max(1, h)} rx={2}
                  fill={m.medible ? 'var(--volumen)' : 'var(--volumen-parcial)'} />
          )
        })}
        <line x1={IZQ} y1={BASE_VOL} x2={ANCHO - DER} y2={BASE_VOL} className="reja" />

        {activas.map((s) => (
          <g key={s.canal}>
            <path d={medibles
              .filter((i) => s.puntos[i] !== null)
              .map((i, j) => `${j ? 'L' : 'M'}${px(i)},${py(s.puntos[i]!)}`)
              .join(' ')} fill="none" stroke={canalColor(s.canal)} strokeWidth={2.5}
              strokeLinejoin="round" strokeLinecap="round" />
            {medibles.filter((i) => s.puntos[i] !== null).map((i) => (
              <circle key={i} cx={px(i)} cy={py(s.puntos[i]!)} r={3.5}
                      fill={canalColor(s.canal)} />
            ))}
          </g>
        ))}

        {meses.map((m, i) => (
          <g key={m.mes}>
            <text x={px(i)} y={ALTO - 6} textAnchor="middle"
                  fill={m.medible ? undefined : 'var(--ink-3)'}>{mesCorto(m.mes)}</text>
            <Columna m={m} x={px(i) - anchoPaso / 2} ancho={anchoPaso} ventanaDias={ventanaDias}
                     filas={([
                       ['Leads seleccionados', n0(volumenes[i]!)],
                     ] as [string, string][]).concat(
                       activas.map((s) => [canalLabel(s.canal), pct1(s.puntos[i])]))} />
          </g>
        ))}
      </svg>

      <div className="leyenda">
        <span><i className="marca-serie" style={{ background: 'var(--volumen)' }} />
          {activas.length === 1
            ? `Leads de ${nombres[0]} que entraron en el mes`
            : 'Leads combinados de los canales seleccionados'}</span>
      </div>

      <figcaption>
        Cada punto muestra qué parte de los leads que entraron ese mes compró durante sus primeros{' '}
        {ventanaDias} días.
      </figcaption>
    </figure>
  )
}
