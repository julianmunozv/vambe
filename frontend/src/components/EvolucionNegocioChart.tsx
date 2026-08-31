/*
 * Cómo evoluciona el negocio mes a mes: UNA serie a la vez, elegida con botones.
 *
 * Antes eran tres paneles apilados con tres escalas distintas. Se veían tres
 * líneas de golpe, pero ninguna se leía: cada panel quedaba en 120px de alto
 * dentro de un gráfico de 432px, las tres escalas obligaban a mirar tres ejes
 * para seguir un solo mes, y las tres líneas salían casi planas —la de ventas
 * dibujaba su rango real de 0 a 1.000 en un tercio de la caja—. Con un panel
 * único la misma tarjeta le da a la serie elegida todo el alto y una sola
 * escala, y el movimiento del mes se ve sin cruzar la vista entre paneles.
 *
 * Los botones son selector y leyenda a la vez, igual que en `TendenciaCanales`:
 * llevan la marca del color de su serie, así que el color de cada métrica queda
 * estable aunque solo una esté dibujada. Acá son EXCLUYENTES —una sola serie
 * activa— porque las tres tienen unidades distintas: superponer ventas (miles)
 * con conversión (unidades de porcentaje) sobre un mismo eje aplasta una de las
 * dos, y es exactamente el problema que tenían los paneles apilados.
 *
 * El globo sigue mostrando las TRES cifras del mes apuntado: la pregunta que
 * contesta un mes raro casi siempre está en otra de las series —un salto de
 * ventas se explica por leads o por conversión— y esa lectura no debería
 * costar tres clics.
 */
import { useState } from 'react'
import type { CohorteRow, VentaMesRow } from '../types'
import { met } from '../kpis/catalogo'
import { mesCorto, mesLargo, n0, pct1 } from '../format'
import { useTooltip } from './Tooltip'

/* viewBox calibrado a la tarjeta de ancho completo (1.560 de tablero − 40 de
   `main` − 32 de la tarjeta ≈ 1.488px útiles):
   1.488 × 188/1240 = 226px de alto renderizado, dentro de los 210-240 de la
   regla. Mover el gráfico a una tarjeta de otro ancho obliga a recalcular ANCHO. */
const ANCHO = 1240, ALTO = 188
const IZQ = 56, DER = 26, ARRIBA = 30, BASE = 152
const PISTA = ANCHO - IZQ - DER

type Clave = 'ventas' | 'leads' | 'conversion'

const SERIES = [
  { id: 'ventas' as const, metrica: 'ventas' as const, color: 'var(--serie-1)' },
  { id: 'leads' as const, metrica: 'leads' as const, color: 'var(--serie-3)' },
  { id: 'conversion' as const, metrica: 'conversion_ventana' as const, color: 'var(--serie-4)' },
]

interface Mes {
  mes: string
  ventas: number
  leads: number
  conversion: number | null
  medible: boolean
}

function escala(max: number): { hi: number; ticks: number[] } {
  const bruto = Math.max(max, 1) / 4
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= bruto) ?? 10 * mag
  const hi = Math.max(paso, Math.ceil(max / paso) * paso)
  const ticks: number[] = []
  for (let v = 0; v <= hi + 0.001; v += paso) ticks.push(Math.round(v * 10) / 10)
  return { hi, ticks }
}

function caminos(valores: (number | null)[], px: (i: number) => number, py: (v: number) => number) {
  const partes: string[] = []
  let actual = ''
  valores.forEach((v, i) => {
    if (v === null) {
      if (actual) partes.push(actual)
      actual = ''
      return
    }
    actual += `${actual ? ' L' : 'M'} ${px(i)} ${py(v)}`
  })
  if (actual) partes.push(actual)
  return partes
}

function Columna({ mes, x, ancho, parcial }: {
  mes: Mes; x: number; ancho: number; parcial: boolean
}) {
  const tip = useTooltip({
    titulo: mesLargo(mes.mes),
    filas: [
      ['Ventas cerradas', n0(mes.ventas)],
      ['Leads que entraron', n0(mes.leads)],
      ['Conversión a 30 días', mes.medible ? pct1(mes.conversion) : 'Aún no comparable'],
    ],
    nota: parcial ? 'Mes en curso: ventas y leads todavía pueden aumentar.' : undefined,
  })
  return (
    <g {...tip}>
      <rect x={x} y={ARRIBA} width={ancho} height={BASE - ARRIBA} fill="transparent" />
    </g>
  )
}

export function EvolucionNegocioChart({ ventas, cohortes, corte, ventanaDias }: {
  ventas: VentaMesRow[]
  cohortes: CohorteRow[]
  corte: string
  ventanaDias: number
}) {
  const [activa, setActiva] = useState<Clave>('ventas')

  const mesesIds = [...new Set([...ventas.map((v) => v.mes), ...cohortes.map((c) => c.mes)])].sort()
  const ventaPorMes = new Map(ventas.map((v) => [v.mes, v.ventas]))
  const cohortePorMes = new Map(cohortes.map((c) => [c.mes, c]))
  const meses: Mes[] = mesesIds.map((mes) => {
    const c = cohortePorMes.get(mes)
    return {
      mes,
      ventas: ventaPorMes.get(mes) ?? 0,
      leads: c?.leads ?? 0,
      conversion: c?.tasa_ventana ?? null,
      medible: c?.medible ?? false,
    }
  })

  const selector = (
    <div className="selector-series" aria-label="Serie mostrada">
      {SERIES.map((s) => (
        <button key={s.id} type="button" aria-pressed={s.id === activa}
                onClick={() => setActiva(s.id)}>
          <i className="marca-serie" style={{ background: s.color }} />
          {met(s.metrica).nombre}
        </button>
      ))}
    </div>
  )

  if (!meses.length) {
    return (
      <figure className="apretada">
        {selector}
        <p className="vacio">No hay datos en la selección.</p>
      </figure>
    )
  }

  const serie = SERIES.find((s) => s.id === activa)!
  const esConversion = activa === 'conversion'

  const mesCorte = corte.slice(0, 7)
  const indiceParcial = meses.findIndex((m) => m.mes === mesCorte)
  const px = (i: number) => meses.length === 1 ? IZQ + PISTA / 2 : IZQ + (PISTA * i) / (meses.length - 1)
  const pasoX = meses.length === 1 ? PISTA : PISTA / (meses.length - 1)
  const anchoHover = Math.min(pasoX, PISTA / meses.length)

  /* La conversión de un mes que no cumplió su ventana todavía va a subir: no se
     dibuja. Ventas y leads del mes en curso sí son definitivos hasta la fecha
     de corte, así que van punteados en vez de omitidos. */
  const valores: (number | null)[] = esConversion
    ? meses.map((m) => m.medible ? m.conversion : null)
    : meses.map((m, i) => i === indiceParcial ? null : m[activa])
  /* La escala se calcula sobre TODOS los meses de la serie, no sobre los que se
     dibujan: el punto punteado del mes en curso está fuera de `valores` y con un
     tope calculado sin él podría caer arriba del borde del panel. */
  const e = escala(esConversion
    ? Math.max(...meses.filter((m) => m.medible).map((m) => m.conversion ?? 0), 1)
    : Math.max(...meses.map((m) => m[activa])))
  const py = (v: number) => BASE - ((BASE - ARRIBA) * v) / e.hi
  const fmtEje = (v: number) => esConversion ? `${n0(v)}%` : n0(v)

  const primerNoMedible = meses.findIndex((m) => !m.medible)
  const xBanda = Math.max(IZQ, px(primerNoMedible) - pasoX / 2)
  /* La banda llega hasta el borde del viewBox y no hasta el eje: el último mes
     está justo sobre `ANCHO - DER` y cortarla ahí dejaba su punto medio afuera,
     como si ese mes sí estuviera medido. */
  const finBanda = Math.min(ANCHO, px(meses.length - 1) + pasoX / 2)

  return (
    <figure className="apretada">
      {selector}
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width="100%" preserveAspectRatio="xMinYMin meet"
           role="img"
           aria-label={`${met(serie.metrica).nombre} por mes, de ${mesLargo(meses[0].mes)} a ${mesLargo(meses[meses.length - 1].mes)}`}>
        {esConversion && primerNoMedible >= 0 && (
          <g>
            <rect x={xBanda} y={ARRIBA - 5} width={finBanda - xBanda}
                  height={BASE - ARRIBA + 5} rx={4} fill="var(--hundido)" />
            <text x={finBanda} y={ARRIBA - 9} textAnchor="end">
              Aún sin sus {ventanaDias} días
            </text>
          </g>
        )}

        {e.ticks.map((v) => (
          <g key={v}>
            <line x1={IZQ} y1={py(v)} x2={ANCHO - DER} y2={py(v)} className="reja" />
            <text x={IZQ - 10} y={py(v) + 4} textAnchor="end">{fmtEje(v)}</text>
          </g>
        ))}

        {caminos(valores, px, py).map((d, i) => (
          <path key={i} d={d} fill="none" stroke={serie.color} strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {valores.map((v, i) => v !== null && (
          <circle key={i} cx={px(i)} cy={py(v)} r={3.7}
                  fill={serie.color} stroke="var(--superficie)" strokeWidth={1.5} />
        ))}

        {!esConversion && indiceParcial > 0 && (
          <g>
            <line x1={px(indiceParcial - 1)} y1={py(meses[indiceParcial - 1][activa])}
                  x2={px(indiceParcial)} y2={py(meses[indiceParcial][activa])}
                  stroke={serie.color} strokeWidth={2.5} strokeDasharray="5 5" opacity={0.45} />
            <circle cx={px(indiceParcial)} cy={py(meses[indiceParcial][activa])} r={3.7}
                    fill={serie.color} opacity={0.45}
                    stroke="var(--superficie)" strokeWidth={1.5} />
          </g>
        )}

        {meses.map((m, i) => (
          <g key={m.mes}>
            <Columna mes={m} x={Math.max(IZQ, px(i) - anchoHover / 2)} ancho={anchoHover}
                     parcial={i === indiceParcial} />
            <text x={px(i)} y={ALTO - 8} textAnchor="middle">{mesCorto(m.mes)}</text>
          </g>
        ))}
      </svg>
      <figcaption>
        {esConversion
          ? `Compara cada mes dentro de los primeros ${ventanaDias} días del lead. Los meses que
             todavía no los cumplieron quedan sin dibujar.`
          : activa === 'ventas'
            ? 'Ventas son cierres del mes. La línea punteada corresponde al mes en curso.'
            : 'Leads son entradas del mes. La línea punteada corresponde al mes en curso.'}
        {' '}Al apuntar un mes se ven sus tres cifras.
      </figcaption>
    </figure>
  )
}
