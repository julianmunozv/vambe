/*
 * RESUMEN — la única pantalla que un gerente mira todos los días.
 *
 * Tres zonas y nada más: cómo vamos, cómo evoluciona, dónde se pierde. Todo lo que
 * antes estaba acá y era detalle se fue a su segmento; el resumen conserva
 * indicadores y visualizaciones que permiten ver cambios en el tiempo.
 *
 * LOS CINCO INDICADORES son el resultado (ventas), el insumo (leads), la
 * eficiencia (conversión), lo que queda por delante (leads activos) y cuánto
 * tarda (ciclo de venta). Nada de lo que está acá arriba es un diagnóstico: lo
 * que requiere investigación vive en su segmento correspondiente.
 */
import type { Dashboard } from '../types'
import { panorama } from '../kpis/panorama'
import { fmt } from '../kpis/catalogo'
import { pct1 } from '../format'
import { Tarjeta, Resalte } from '../components/Tarjeta'
import { StripKpi } from '../components/StripKpi'
import type { Tile } from '../components/StripKpi'
import { EvolucionNegocioChart } from '../components/EvolucionNegocioChart'
import { Recorrido } from '../components/Recorrido'
import { MezclaCanales } from '../components/MezclaCanales'

export function PaginaResumen({ d, onIr }: { d: Dashboard; onIr: (id: string) => void }) {
  const p = panorama(d)
  const r = d.resumen

  const tiles: Tile[] = [
    { id: 'ventas', valor: fmt('ventas', r.ganados), nota: 'leads que compraron',
      variacion: p.tendencia.ventas, unidad: 'rel', comparacion: 'calendario' },
    { id: 'leads', valor: fmt('leads', r.leads), nota: 'entraron al embudo',
      variacion: p.tendencia.leads, unidad: 'rel', comparacion: 'calendario' },
    { id: 'conversion_ventana', valor: fmt('conversion_ventana', p.promedioComparable),
      nota: `compraron en sus primeros ${d.contexto.ventana_dias} días`,
      variacion: p.tendencia.conversion, unidad: 'pts', comparacion: 'ventana' },
    { id: 'cartera_viva', valor: fmt('cartera_viva', p.cartera.viva),
      nota: 'abiertos con movimiento en los últimos 90 días', onClick: () => onIr('embudo') },
    { id: 'ciclo_venta', valor: fmt('ciclo_venta', r.dias_a_venta),
      nota: 'mediana de los que compran', onClick: () => onIr('embudo') },
  ]

  const ventana = d.contexto.ventana_dias

  return (
    <div className="tablero">
      <StripKpi tiles={tiles} ventanaDias={ventana} />

      <Tarjeta titulo="Cómo va el año, mes a mes"
               nota={`Una serie a la vez: ventas, leads o la conversión de cada mes en sus primeros ${ventana} días`}>
        <EvolucionNegocioChart ventas={d.ventas_mes} cohortes={d.cohortes}
                               corte={d.contexto.corte} ventanaDias={ventana} />
      </Tarjeta>

      <div className="rejilla c23">
        <Tarjeta titulo="Volumen y conversión por canal"
                 nota="Qué parte de los leads recibe cada canal y qué parte de las ventas produce"
                 accion={{ rotulo: 'Ver canales', onClick: () => onIr('canales') }} alto>
          <MezclaCanales mezcla={p.mezcla} />
        </Tarjeta>

        <Tarjeta titulo="Dónde se pierden"
                 nota="Etapas alcanzadas y lo que se cae en cada salto"
                 aside={<Resalte rotulo="Llegan a venta" valor={pct1(r.tasa_conversion)} />}
                 accion={{ rotulo: 'Ver embudo', onClick: () => onIr('embudo') }} alto>
          <Recorrido pasos={p.flujo} />
        </Tarjeta>
      </div>
    </div>
  )
}
