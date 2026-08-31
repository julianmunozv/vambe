/*
 * LAS TRES CONCLUSIONES. Las reglas que deciden qué se le dice al gerente.
 *
 * Están acá y no dentro del componente porque son reglas con umbrales
 * discutibles (cuánto volumen hace comparable a un canal, desde cuándo una
 * cartera está podrida) y esos umbrales tienen que poder cambiarse sin abrir
 * un archivo de UI.
 *
 * Se DERIVAN de los datos filtrados, no están escritas a mano: si el gerente
 * filtra por una sucursal, la conclusión que lee es la de esa sucursal. Una
 * tarjeta que dejó de ser cierta bajo el filtro simplemente no aparece — que es
 * la única forma honesta de tener texto de conclusión en un panel interactivo.
 */
import type { Dashboard } from '../types'
import { n0, pct1 } from '../format'
import { canalLabel } from '../theme'

export interface Hallazgo {
  cinta: string
  color: 'malo' | 'alerta'
  cifra: string
  titulo: string
  cuerpo: string
  accion: string
  /** Segmento del panel donde se sigue el hilo. */
  ir: string
}

/** Volumen mínimo para comparar tasas. Bajo esto la diferencia es ruido de muestra. */
const MIN_VOLUMEN = 200

/** Desde cuántos días sin moverse un lead abierto deja de ser cartera y pasa a ser ruido. */
const DIAS_PODRIDO = 90

export function hallazgos(d: Dashboard): Hallazgo[] {
  const cards: Hallazgo[] = []

  const comparables = d.canales.filter((c) => c.leads >= MIN_VOLUMEN && c.tasa_conversion !== null)
  if (comparables.length >= 2) {
    const peor = comparables.reduce((a, b) => (a.tasa_conversion! <= b.tasa_conversion! ? a : b))
    const mejor = comparables.reduce((a, b) => (a.tasa_conversion! >= b.tasa_conversion! ? a : b))
    const share = (100 * peor.leads) / d.resumen.leads
    const veces = (mejor.tasa_conversion! / peor.tasa_conversion!).toFixed(1).replace('.', ',')
    cards.push({
      cinta: 'Adquisición', color: 'alerta', cifra: pct1(peor.tasa_conversion), ir: 'canales',
      titulo: `${canalLabel(peor.canal)} trae el ${share.toFixed(0)}% del volumen y es el que peor convierte`,
      cuerpo: `${n0(peor.leads)} leads que terminan en ${n0(peor.ganados)} ventas. `
        + `${canalLabel(mejor.canal)} convierte ${veces} veces mejor (${pct1(mejor.tasa_conversion)}) `
        + `con ${n0(mejor.leads)} leads.`,
      accion: 'El costo por lead no es el número que importa; el costo por venta sí. '
        + 'Mover presupuesto de volumen a las campañas y canales que sostienen la tasa.',
    })
  }

  const sin = d.handoff.find((h) => h.tramo === 'sin respuesta')
  const conResp = d.handoff.filter((h) => h.tramo !== 'sin respuesta' && h.tramo !== 'no transferido')
  const leadsResp = conResp.reduce((a, h) => a + h.leads, 0)
  const ganResp = conResp.reduce((a, h) => a + h.ganados, 0)
  if (sin && sin.leads > 0) {
    const tasaResp = leadsResp ? (100 * ganResp) / leadsResp : null
    cards.push({
      cinta: 'Operación', color: 'malo', cifra: n0(sin.leads), ir: 'equipo',
      titulo: 'La IA los escaló a un vendedor y nadie contestó nunca',
      cuerpo: `Convierten al ${pct1(sin.tasa_conversion)} contra ${pct1(tasaResp)} de los que sí `
        + 'recibieron respuesta. Entre los que la reciben, llegar en menos de una hora o en más de un '
        + 'día casi no cambia el resultado: lo que decide es que alguien conteste.',
      accion: 'Avisar cuando un lead pasado a un vendedor lleva 24 h sin que nadie le escriba. '
        + 'Es el arreglo más barato de todos: no hace falta ni más leads ni más gente.',
    })
  }

  const viejos = d.estancados.reduce((a, e) => a + e.d90_mas, 0)
  if (viejos > 0 && d.resumen.abiertos > 0) {
    const peorEtapa = d.estancados.reduce((a, b) => (a.d90_mas >= b.d90_mas ? a : b))
    cards.push({
      cinta: 'Cartera', color: 'alerta', cifra: n0(viejos), ir: 'embudo',
      titulo: `Leads abiertos parados hace más de ${DIAS_PODRIDO} días`,
      cuerpo: `Son el ${((100 * viejos) / d.resumen.abiertos).toFixed(0)}% de la cartera abierta `
        + `(${n0(d.resumen.abiertos)}). La mayor concentración está en «${peorEtapa.etapa}», con `
        + `${n0(peorEtapa.d90_mas)}. El más antiguo lleva ${n0(peorEtapa.dias_max)} días.`,
      accion: 'No son cartera, son ruido en el pipeline: inflan el pronóstico y esconden los leads '
        + 'vivos. Cerrarlos o reactivarlos con una campaña específica.',
    })
  }

  return cards
}
