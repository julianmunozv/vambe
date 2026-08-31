/*
 * La fila de indicadores: cinco tarjetas pequeñas, una sola línea, sin scroll.
 *
 * La versión anterior tenía cinco bloques de 32px de cifra y una cabecera aparte
 * con la conversión a 56px — ocupaba media pantalla para decir cinco números.
 * Acá cada tarjeta es rótulo · píldora de variación · cifra · nota, y las cinco
 * entran en 92px de alto.
 *
 * LA PÍLDORA SOLO APARECE SI LA VARIACIÓN EXISTE. `cohortes` da serie mensual de
 * leads, ganados y tasa; las demás métricas no tienen contra qué compararse, y
 * ahí la esquina queda vacía. Un hueco es correcto; un porcentaje inventado que
 * la gerencia lee como tendencia, no.
 *
 * Y la variación que sí existe se mide DENTRO DE LA VENTANA de los dos meses que
 * compara (los primeros N días de cada lead). Sobre el acumulado, el mes más
 * nuevo de los dos siempre pierde: le faltan semanas de ventas que el otro ya
 * tiene. Por eso la nota de abajo dice con qué vara se comparó.
 */
import type { ReactNode } from 'react'
import type { Variacion } from '../kpis/panorama'
import type { ClaveMetrica } from '../kpis/catalogo'
import { Rotulo } from './Cifra'
import { mesLargo } from '../format'

/** true = subir es bueno. La cartera detenida sube y eso es malo. */
export interface Tile {
  id: ClaveMetrica
  valor: string
  nota: string
  variacion?: Variacion | null
  /** Cuando la respuesta a la pregunta es un nombre y no una cifra —qué salto,
   *  qué etapa—, el nombre es el titular y el número baja a pie de cifra: lo
   *  primero que se lee tiene que ser lo accionable. */
  titular?: 'nota'
  /** Cómo se lee la variación: puntos de tasa o cambio relativo. */
  unidad?: 'pts' | 'rel'
  /** La conversión necesita misma edad; los conteos comparan meses calendario. */
  comparacion?: 'ventana' | 'calendario'
  estado?: 'malo' | 'alerta'
  onClick?: () => void
}

const signo = (x: number): string => (x >= 0 ? '+' : '−')
const uno = (x: number): string => Math.abs(x).toFixed(1).replace('.', ',')

export function Pildora({ v, unidad = 'rel', dias, comparacion = 'calendario' }: {
  v: Variacion; unidad?: 'pts' | 'rel'; dias?: number; comparacion?: 'ventana' | 'calendario'
}) {
  const x = unidad === 'pts' ? v.delta : v.relativo
  const sube = x >= 0
  return (
    <span className="pildora" data-sube={sube ? 'si' : 'no'}
          title={`${mesLargo(v.hasta)} contra ${mesLargo(v.desde)}`
            + (comparacion === 'ventana' && dias
              ? `, los dos medidos en sus primeros ${dias} días`
              : ', dos meses calendario completos')}>
      <small>Últ. mes</small> {signo(x)}{uno(x)}{unidad === 'pts' ? ' pts' : '%'}
    </span>
  )
}

export function StripKpi({ tiles, ventanaDias }: { tiles: Tile[]; ventanaDias: number }) {
  return (
    <div className="rejilla franja">
      {tiles.map((t) => {
        const contenido = <>
          <div className="alto">
            <span className="rotulo">
              {t.estado && <i className="punto" style={{ background: `var(--${t.estado})` }} />}
              <Rotulo id={t.id} />
            </span>
            {t.variacion && <Pildora v={t.variacion} unidad={t.unidad} dias={ventanaDias}
                                      comparacion={t.comparacion} />}
          </div>
          {t.titular === 'nota' ? <>
            <div className="valor texto" title={t.nota}>{t.nota}</div>
            <div className="nota num">{t.valor}</div>
          </> : <>
            <div className="valor num">{t.valor}</div>
            <div className="nota num" title={t.nota}>{t.nota}</div>
          </>}
        </>
        return t.onClick ? (
          <button type="button" className="kpi kpi-enlace" key={t.id} onClick={t.onClick}>
            {contenido}
          </button>
        ) : <div className="kpi" key={t.id}>{contenido}</div>
      })}
    </div>
  )
}

/** Variación suelta, para las esquinas de tarjeta. */
export function Aparte({ children }: { children: ReactNode }) {
  return <span className="linea">{children}</span>
}
