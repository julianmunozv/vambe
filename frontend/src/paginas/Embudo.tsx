/*
 * EMBUDO — en qué parte del proceso se pierden los leads.
 *
 * Era la pantalla más difícil de leer del panel, y el motivo no era el diseño de
 * ningún gráfico: era que los mismos números estaban tres veces. El recorrido
 * era una copia del bloque del Resumen; la tabla de al lado tenía ese recorrido
 * escrito en columnas («Llegaron» y «Se cae aquí» salían de los pasos ya
 * dibujados) y además «Esperando hoy», que es la primera columna de la tabla de
 * cartera de más abajo. Cuatro bloques para decir tres cosas.
 *
 * Quedaron tres zonas de diagnóstico:
 *   · salto por salto  — cuántos leads deja cada paso, no solo el porcentaje
 *   · cuánto tarda     — los días por etapa, que el Resumen no puede mostrar
 *   · quién espera hoy — la cartera abierta por antigüedad, la lista de trabajo
 *
 * La franja sintetiza esas tres zonas; el Resumen conserva los totales del
 * negocio. Acá va el diagnóstico que justifica entrar, no esos titulares otra
 * vez.
 */
import type { Dashboard } from '../types'
import type { Columna } from '../components/DataTable'
import type { Tile } from '../components/StripKpi'
import { DataTable } from '../components/DataTable'
import { StripKpi } from '../components/StripKpi'
import { Tarjeta } from '../components/Tarjeta'
import { Saltos } from '../components/Saltos'
import { DiasEtapa } from '../components/DiasEtapa'
import { panorama } from '../kpis/panorama'
import { fmt } from '../kpis/catalogo'
import { n0, pct1 } from '../format'

const COLS_CARTERA: Columna<Dashboard['estancados'][number]>[] = [
  { clave: 'etapa', titulo: 'Etapa', celda: (e) => e.etapa },
  { clave: 'abiertos', titulo: 'Abiertos', metrica: 'estancados_aqui', celda: (e) => n0(e.abiertos) },
  { clave: 'd0_7', titulo: '0-7 días', celda: (e) => n0(e.d0_7) },
  { clave: 'd8_30', titulo: '8-30 días', celda: (e) => n0(e.d8_30) },
  { clave: 'd31_90', titulo: '31-90 días', celda: (e) => n0(e.d31_90) },
  { clave: 'd90', titulo: '+90 días', metrica: 'cartera_vieja', destacada: true, celda: (e) => (
    <span style={{ color: e.d90_mas > e.abiertos / 2 ? 'var(--malo)' : 'var(--ink)' }}>
      {n0(e.d90_mas)}
    </span>) },
  { clave: 'max', titulo: 'El más antiguo', metrica: 'dias_max', celda: (e) => `${n0(e.dias_max)} d` },
]

export function PaginaEmbudo({ d }: { d: Dashboard }) {
  const p = panorama(d)
  const s = p.saltoCaro
  const lenta = p.etapaLenta

  /* Tres respuestas accionables y propias del embudo: dónde se pierde, dónde
     se demora y cuánto trabajo lleva demasiado tiempo quieto. Los totales y la
     conversión global viven en Resumen. */
  const tiles: Tile[] = [
    /* En estos dos el titular es el nombre: la decisión es sobre QUÉ salto y QUÉ
       etapa hay que trabajar, y el porcentaje o los días solo lo dimensionan. */
    { id: 'salto_caro', valor: fmt('salto_caro', s?.caida), estado: s ? 'malo' : undefined,
      titular: 'nota',
      nota: s ? `${s.desde} → ${s.hasta}` : 'sin dos etapas comparables' },
    { id: 'etapa_lenta', valor: fmt('etapa_lenta', lenta?.dias), titular: 'nota',
      nota: lenta?.etapa ?? 'sin tiempos medibles' },
    { id: 'cartera_vieja', valor: fmt('cartera_vieja', p.cartera.detenida),
      estado: p.cartera.detenida > 0 ? 'malo' : undefined,
      nota: `${pct1(p.cartera.podrida)} de los leads abiertos` },
  ]

  return (
    <div className="tablero">
      <StripKpi tiles={tiles} ventanaDias={d.contexto.ventana_dias} />

      <div className="rejilla c23">
        <Tarjeta titulo="Salto por salto, de la entrada a la venta"
                 nota="La barra muestra cuántos llegaron; a la derecha, la pérdida desde la etapa anterior"
                 alto>
          <Saltos pasos={p.flujo} peor={s} />
        </Tarjeta>

        <Tarjeta titulo="Cuánto tarda cada etapa"
                 nota="Días que un lead se queda quieto en cada una antes de moverse"
                 alto>
          <DiasEtapa etapas={d.embudo} ciclo={d.resumen.dias_a_venta} />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Cartera fría por etapa"
               nota="Leads abiertos por antigüedad; en rojo, las etapas donde más de la mitad lleva +90 días sin moverse">
        <DataTable columnas={COLS_CARTERA} filas={d.estancados} claveFila={(e) => e.etapa} />
      </Tarjeta>
    </div>
  )
}
