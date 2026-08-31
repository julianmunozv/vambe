/*
 * Conversión por mes de entrada del lead, MEDIDA A LA MISMA EDAD.
 *
 * Una sola medida y una sola línea. El volumen NO va acá: ya está en el
 * indicador «Leads» y en «De dónde vienen», y meterlo obligaba a dos paneles
 * que el lector tenía que alinear con la vista.
 *
 * Lo que la línea dibuja es la conversión DENTRO DE LA VENTANA (los primeros N
 * días de cada lead), no el resultado final del mes. El resultado final de un
 * mes reciente está incompleto: con el corte del export en jun 2026, jun 2025
 * tuvo 350 días para convertir y abr 2026 tuvo 46. Dibujados en la misma serie,
 * la diferencia se lee como una caída del negocio y es la edad de las cohortes
 * — medido: el final bajaba de 12,3% a 10,6% mientras la conversión a 30 días
 * subía de 3,0% a 5,1%. El acumulado hasta hoy sigue estando en el globo, que
 * es donde no invita a comparar un mes con otro.
 *
 * Tres decisiones que hacen que se entienda sin pie de foto:
 *
 *  1. El eje se ajusta al rango real. De 0 a 15% la serie vivía aplastada y una
 *     caída de un tercio de la tasa se veía como un escalón. Cuando el eje no
 *     arranca en cero va marcado con el corte.
 *  2. Una línea de referencia con la conversión del conjunto de los meses
 *     comparables, para que cada mes se lea como arriba o abajo sin hacer la
 *     cuenta.
 *  3. LOS MESES QUE TODAVÍA NO CUMPLEN LA VENTANA NO SE DIBUJAN SOBRE LA
 *     ESCALA. A ellos les falta parte de su propia ventana, así que su cifra va
 *     a seguir subiendo: van en una zona aparte, sin punto y sin cifra.
 *
 * El volumen queda en el globo. Codificarlo además en el tamaño del punto sumaba
 * una segunda lectura a una vista cuyo trabajo principal es mostrar tendencia.
 */
import type { CohorteRow } from '../types'
import { mesCorto, mesLargo, n0, pct1 } from '../format'
import { useTooltip } from './Tooltip'

const ARRIBA = 22, ABAJO = 24

/**
 * Topes redondos y POCAS líneas: un eje que dice 11,3% y 8,4% obliga a leer el
 * número, y ocho guías compiten con la serie. Se toma el primer paso de la
 * escala 1-2-5 que deje el eje en cuatro o cinco marcas.
 */
function escala(vals: number[]): { lo: number; hi: number; paso: number } {
  const min = Math.min(...vals), max = Math.max(...vals)
  const rango = Math.max(max - min, 1)
  const bruto = (rango * 1.55) / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= bruto) ?? 10 * mag
  return {
    lo: Math.max(0, Math.floor((min - rango * 0.3) / paso) * paso),
    hi: Math.ceil((max + rango * 0.25) / paso) * paso,
    paso,
  }
}

/* El globo lleva las dos cifras y las nombra distinto: la de la ventana es la
   que está en la línea, y el acumulado hasta hoy dice explícitamente que no se
   compara. Sin ese rótulo, dos números de conversión en un mismo globo se leen
   como el mismo dato medido dos veces. */
function Punto({ c, dias, cx, cy }: {
  c: CohorteRow; dias: number; cx: number; cy: number
}) {
  const tip = useTooltip({
    titulo: mesLargo(c.mes),
    filas: [
      ['Leads que entraron', n0(c.leads)],
      [`Compraron en sus primeros ${dias} días`, `${n0(c.ganados_ventana)} · ${pct1(c.tasa_ventana)}`],
      ['Total que compró hasta hoy', `${n0(c.ganados)} · ${pct1(c.tasa_conversion)}`],
      ['Todavía abiertos', n0(c.abiertos)],
    ],
    nota: 'La línea dibuja la primera cifra: es la única que se puede comparar '
      + 'con otro mes. El total sigue creciendo mientras el mes tenga leads abiertos.',
  })
  return (
    <g {...tip}>
      <circle cx={cx} cy={cy} r={5} fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth={2} />
    </g>
  )
}

function SinVentana({ c, dias, x, ancho, y, alto }: {
  c: CohorteRow; dias: number; x: number; ancho: number; y: number; alto: number
}) {
  const tip = useTooltip({
    titulo: mesLargo(c.mes),
    filas: [
      ['Leads que entraron', n0(c.leads)],
      ['Compraron hasta ahora', n0(c.ganados)],
      ['Todavía abiertos', n0(c.abiertos)],
    ],
    nota: `Entró hace muy poco: a sus leads todavía no les pasaron los ${dias} días `
      + 'con los que se mide a los demás, así que su cifra va a seguir subiendo.',
  })
  return <g {...tip}><rect x={x} y={y} width={ancho} height={alto} fill="transparent" /></g>
}

export function ConversionChart({ meses, ventanaDias, promedio, ancho = 880, alto = 150 }: {
  meses: CohorteRow[]
  /** Los días dentro de los que se cuenta la venta. Se nombra en pantalla: es
   *  parte de la definición de la cifra, no un detalle de implementación. */
  ventanaDias: number
  /** Conversión a la ventana del conjunto de los meses comparables. */
  promedio: number | null
  ancho?: number
  alto?: number
}) {
  const comparables = meses.filter((c) => c.medible && c.tasa_ventana !== null)
  if (comparables.length < 2) {
    return <p className="vacio">Se necesitan al menos dos meses comparables para ver la serie.</p>
  }

  const sinVentana = meses.filter((c) => !c.medible)
  const IZQ = 42, DER = sinVentana.length ? 88 : 56
  const { lo, hi, paso } = escala(
    comparables.map((c) => c.tasa_ventana!).concat(promedio === null ? [] : [promedio]))
  const EJE = ARRIBA + alto + ABAJO

  const px = (i: number) => IZQ + ((ancho - IZQ - DER) * i) / (meses.length - 1)
  const py = (v: number) => ARRIBA + alto - (alto * (v - lo)) / (hi - lo)
  const anchoPaso = (ancho - IZQ - DER) / (meses.length - 1)

  const ticks: number[] = []
  for (let v = lo; v <= hi + 0.001; v += paso) ticks.push(Math.round(v * 10) / 10)

  const iSin = meses.findIndex((c) => !c.medible)
  const d = comparables
    .map((c, j) => `${j ? 'L' : 'M'}${px(meses.indexOf(c))},${py(c.tasa_ventana!)}`).join(' ')

  /* Etiqueta directa solo en el mejor, el peor y el último comparable — nunca
     una cifra sobre cada punto, que es ruido y no se lee. */
  const mejor = comparables.reduce((a, b) => (a.tasa_ventana! >= b.tasa_ventana! ? a : b))
  const peor = comparables.reduce((a, b) => (a.tasa_ventana! <= b.tasa_ventana! ? a : b))
  const ultimo = comparables[comparables.length - 1]!
  /* El último valor ya está en el resumen de la tarjeta; dentro de la serie solo
     se rotula la anomalía más baja para no duplicar la cifra principal. */
  const marcados = [peor]
  const pendientes = !sinVentana.length
    ? ''
    : sinVentana.length === 1
      ? mesCorto(sinVentana[0]!.mes)
      : `${mesCorto(sinVentana[0]!.mes)}–${mesCorto(sinVentana[sinVentana.length - 1]!.mes)}`

  return (
    <figure>
      <svg viewBox={`0 0 ${ancho} ${EJE}`} width="100%" preserveAspectRatio="xMinYMin meet" role="img"
           aria-label={`Conversión en los primeros ${ventanaDias} días, por mes de entrada del lead, entre ${pct1(peor.tasa_ventana)} y ${pct1(mejor.tasa_ventana)}`}>
        {/* Los meses a los que les falta ventana: la zona se apaga y lo dice con
            todas las letras, en el centro. Sin flechas ni cifras — una cifra ahí
            adentro se lee como un punto más de la serie. */}
        {iSin >= 0 && (
          <g>
            <rect x={px(iSin) - anchoPaso / 2} y={ARRIBA - 8}
                  width={ancho - DER - (px(iSin) - anchoPaso / 2)} height={alto + 8}
                  fill="var(--hundido)" fillOpacity={0.62} rx={4} />
            <text x={ancho - DER} y={ARRIBA - 12} textAnchor="end"
                  fill="var(--ink-2)" fontSize={11} fontWeight={500}>
              {pendientes} aún no comparables
            </text>
          </g>
        )}

        {ticks.map((v) => (
          <g key={v}>
            <line x1={IZQ} y1={py(v)} x2={ancho - DER} y2={py(v)} className="reja" />
            <text x={IZQ - 9} y={py(v) + 4} textAnchor="end">{v}%</text>
          </g>
        ))}

        {/* el eje no arranca en cero: va dicho con el corte, no dado por sentado */}
        {lo > 0 && (
          <path d={`M${IZQ - 6},${py(lo) - 1} l7,-7 M${IZQ - 6},${py(lo) + 3} l7,-7`}
                stroke="var(--ink-3)" strokeWidth={1.3} strokeLinecap="round" fill="none" />
        )}

        {promedio !== null && (
          <g>
            <line x1={IZQ} y1={py(promedio)} x2={px(meses.indexOf(ultimo))} y2={py(promedio)}
                  stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={px(meses.indexOf(ultimo)) - 8} y={py(promedio) - 7}
                  textAnchor="end" fill="var(--ink-2)" fontSize={11}>
              Promedio del período · {pct1(promedio)}
            </text>
          </g>
        )}

        <path d={d} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinejoin="round" />

        {meses.map((c, i) => (
          <g key={c.mes}>
            {c.medible
              ? <Punto c={c} dias={ventanaDias} cx={px(i)} cy={py(c.tasa_ventana ?? lo)} />
              : <SinVentana c={c} dias={ventanaDias} x={px(i) - anchoPaso / 2} ancho={anchoPaso}
                            y={ARRIBA} alto={alto} />}
            <text x={px(i)} y={EJE - 8} textAnchor="middle"
                  fill={c.medible ? undefined : 'var(--ink-3)'}>{mesCorto(c.mes)}</text>
            {/* zona sensible de columna entera: apuntar a un radio de 4px es incómodo */}
            <rect x={px(i) - anchoPaso / 2} y={ARRIBA} width={anchoPaso} height={alto} fill="transparent" />
          </g>
        ))}

        {marcados.map((c) => (
          <text key={c.mes} x={px(meses.indexOf(c))}
                y={py(c.tasa_ventana!) + (c.tasa_ventana! >= (promedio ?? 0) ? -13 : 20)}
                textAnchor="middle" className="valor">
            {pct1(c.tasa_ventana)}
          </text>
        ))}
      </svg>

      {sinVentana.length > 0 && (
        <figcaption>
          {sinVentana.map((c) => mesLargo(c.mes)).join(' y ')}
          {sinVentana.length > 1 ? ' quedan' : ' queda'} fuera: todavía no completaron{' '}
          {ventanaDias} días.
        </figcaption>
      )}
    </figure>
  )
}
