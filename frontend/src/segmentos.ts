/*
 * Los segmentos del panel: una decisión de negocio cada uno.
 *
 * El criterio no es «qué tablas tenemos» sino «qué se hace distinto mañana
 * según lo que diga esta pantalla». Por eso son cuatro y no ocho:
 *
 *   Canales  → dónde pongo el presupuesto
 *   Embudo   → qué parte del proceso arreglo
 *   Equipo   → a quién le pido qué
 *
 * y Resumen arriba, que es la única pantalla que un gerente mira todos los días.
 *
 * La versión anterior tenía un segmento «Operación IA». Es una división por
 * TECNOLOGÍA, no por decisión: nadie de comercial se pregunta «cómo va la IA»,
 * se pregunta si están contestando. El traspaso y el SLA del asistente viven
 * ahora en Equipo, que es donde está la acción — el asistente es el que atiende
 * primero, y medirlo aparte del equipo humano parte en dos una misma pregunta.
 * La tabla de herramientas no se mudó: salió del panel, porque una tasa de falla
 * por tool se arregla en producto y no cambia ninguna decisión comercial.
 *
 * Metodología va última y separada: se consulta, no se recorre.
 */
export interface Segmento {
  id: string
  rotulo: string
  /** La decisión que habilita el segmento. Se lee en la cabecera al entrar. */
  pregunta: string
  /** Trazo del icono, sobre una grilla de 20×20. */
  icono: string
  /** Los de apoyo van separados del recorrido principal en el menú. */
  apoyo?: boolean
}

export const SEGMENTOS: Segmento[] = [
  { id: 'resumen', rotulo: 'Resumen', pregunta: 'Cómo va el negocio',
    icono: 'M3 12h3.5l2.5-6 3 12 2.5-6H17' },
  { id: 'canales', rotulo: 'Canales', pregunta: 'Qué canales aportan volumen y ventas de mejor calidad',
    icono: 'M4 16V9M8 16V5M12 16v-4M16 16V7' },
  { id: 'embudo', rotulo: 'Embudo', pregunta: 'En qué parte del proceso se pierden',
    icono: 'M3 5h14l-5 6v5l-4 2v-7z' },
  { id: 'equipo', rotulo: 'Equipo', pregunta: 'Quién atiende y cómo responde',
    icono: 'M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-4 7c0-2.2 1.8-4 4-4s4 1.8 4 4m2-9.5a2.5 2.5 0 1 1 2 4M13 16c0-2.2 1.3-4 3-4' },
]

const IDS = new Set(SEGMENTOS.map((s) => s.id))

/** El segmento vive en el hash para que un link a «Embudo» siga apuntando ahí. */
export const leerHash = (): string => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return IDS.has(id) ? id : SEGMENTOS[0]!.id
}
