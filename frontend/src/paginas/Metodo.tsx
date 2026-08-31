/*
 * METODOLOGÍA — cómo se calculó todo lo demás.
 *
 * Está adentro del panel y no en un anexo: un tablero que dice «limpiamos los
 * datos» sin mostrar qué sacó pide un acto de fe.
 */
import type { Dashboard } from '../types'
import { Method } from '../components/Method'
import { CatalogoMetricas } from '../components/CatalogoMetricas'
import { Tarjeta } from '../components/Tarjeta'

export function PaginaMetodo({ d }: { d: Dashboard }) {
  return (
    <div className="tablero">
      <Method ventanaDias={d.contexto.ventana_dias} p75Venta={d.contexto.p75_dias_a_venta}
              totalLeads={d.resumen.leads} />

      <Tarjeta titulo="Diccionario de métricas"
               nota="Qué mide cada cifra del panel y en qué archivo se calcula — los mismos textos que aparecen al apuntar un rótulo">
        <CatalogoMetricas />
      </Tarjeta>
    </div>
  )
}
