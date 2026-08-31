/*
 * EL DICCIONARIO DE MÉTRICAS. Qué se llama cómo, y qué significa exactamente.
 *
 * Existe porque en un panel el nombre de una métrica es parte de su definición:
 * "conversión" puede significar cuatro cosas distintas y la gerencia no tiene
 * cómo saber cuál está mirando. Cada entrada dice el rótulo, el formato y la
 * definición en una frase — y `donde` apunta al archivo que la calcula, para
 * que "¿de dónde sale este número?" tenga una respuesta de un salto.
 *
 * Acá NO se calcula nada. Cambiar una entrada cambia cómo se rotula y se
 * explica una cifra en toda la UI; cambiar el número es ir al archivo que la
 * entrada nombra, y después correr `npm run verify`.
 */
import { dias1, n0, pct1, veces1 } from '../format'

export type Formato = 'n' | 'pct' | 'dias' | 'x'

export interface Metrica {
  /** Rótulo en pantalla. Corto: entra en un encabezado de tabla. */
  nombre: string
  formato: Formato
  /** Qué mide, en una frase. Se muestra al apuntar el rótulo. */
  definicion: string
  /** Archivo donde vive el cálculo, sin la extensión: hay uno .ts y uno .py. */
  donde: string
}

export const CATALOGO = {
  /* ── volumen ─────────────────────────────────────────────────────────── */
  leads: {
    nombre: 'Leads', formato: 'n', donde: 'kpis/resumen',
    definicion: 'Personas distintas que entraron al embudo.',
  },
  ventas: {
    nombre: 'Ventas', formato: 'n', donde: 'kpis/resumen',
    definicion: 'Leads que llegaron a la etapa terminal de éxito.',
  },
  abiertos: {
    nombre: 'Abiertos', formato: 'n', donde: 'kpis/resumen',
    definicion: 'Leads que todavía no llegaron a ninguna etapa terminal.',
  },
  cerrados: {
    nombre: 'Cerrados', formato: 'n', donde: 'kpis/resumen',
    definicion: 'Leads en una etapa terminal, ganados o perdidos.',
  },

  /* ── tasas de conversión ─────────────────────────────────────────────── */
  conversion: {
    nombre: 'Conversión a venta', formato: 'pct', donde: 'kpis/resumen',
    definicion: 'Ventas sobre el total de leads.',
  },
  conversion_ventana: {
    nombre: 'Conversión a 30 días', formato: 'pct', donde: 'kpis/cohortes',
    definicion: 'Leads que compraron dentro de sus primeros 30 días, sobre los que entraron en el mes.',
  },
  test_drive: {
    nombre: 'Llegan a test drive', formato: 'pct', donde: 'kpis/resumen',
    definicion: 'Leads que agendaron al menos un test drive.',
  },
  transferencia: {
    nombre: 'Transferidos a un vendedor', formato: 'pct', donde: 'kpis/resumen',
    definicion: 'Leads que la IA escaló a una persona.',
  },
  no_show: {
    nombre: 'No-show', formato: 'pct', donde: 'kpis/resumen',
    definicion: 'Leads que faltaron a al menos una cita agendada.',
  },

  /* ── operación ───────────────────────────────────────────────────────── */
  handoff_perdido: {
    nombre: 'Escalados sin respuesta', formato: 'n', donde: 'kpis/resumen',
    definicion: 'Leads transferidos por la IA que nunca recibieron un mensaje humano.',
  },
  ciclo_venta: {
    nombre: 'Ciclo de venta', formato: 'dias', donde: 'kpis/resumen',
    definicion: 'Mediana de días que tardan en cerrarse los leads que compraron.',
  },
  dias_embudo: {
    nombre: 'Días en el embudo', formato: 'dias', donde: 'kpis/resumen',
    definicion: 'Mediana de días que tarda un lead en comprar o perderse.',
  },
  cartera_viva: {
    nombre: 'Leads activos', formato: 'n', donde: 'kpis/panorama',
    definicion: 'Leads abiertos que se movieron en los últimos 90 días.',
  },
  cartera_vieja: {
    nombre: 'Leads sin movimientos', formato: 'n', donde: 'kpis/embudo',
    definicion: 'Leads abiertos que llevan más de 90 días sin cambiar de etapa.',
  },

  /* ── embudo ──────────────────────────────────────────────────────────── */
  alcanzaron: {
    nombre: 'Alcanzaron', formato: 'n', donde: 'kpis/embudo',
    definicion: 'Leads que pasaron por la etapa, estén o no actualmente en ella.',
  },
  estancados_aqui: {
    nombre: 'Detenidos aquí hoy', formato: 'n', donde: 'kpis/embudo',
    definicion: 'Leads abiertos cuya etapa actual es esta.',
  },
  salto_caro: {
    nombre: 'Mayor caída entre etapas', formato: 'pct', donde: 'kpis/panorama',
    definicion: 'Mayor porcentaje de pérdida entre dos etapas consecutivas.',
  },
  etapa_lenta: {
    nombre: 'Etapa más lenta', formato: 'dias', donde: 'kpis/panorama',
    definicion: 'Mayor mediana de permanencia entre las etapas del embudo.',
  },
  perdidos_salto: {
    nombre: 'Se pierden en el salto', formato: 'n', donde: 'kpis/panorama',
    definicion: 'Leads que habían llegado a una etapa y no alcanzaron la siguiente.',
  },
  dias_etapa: {
    nombre: 'Mediana en la etapa', formato: 'dias', donde: 'kpis/embudo',
    definicion: 'Días que vive un lead en la etapa, sumando reocupaciones.',
  },
  dias_max: {
    nombre: 'El más antiguo', formato: 'n', donde: 'kpis/embudo',
    definicion: 'Días que lleva sin moverse el lead más viejo de la etapa.',
  },

  /* ── canales y orígenes ──────────────────────────────────────────────── */
  dias_canal: {
    nombre: 'Días prom.', formato: 'dias', donde: 'kpis/canales',
    definicion: 'Promedio de días en el embudo de los leads del canal u origen.',
  },
  mensajes: {
    nombre: 'Mensajes prom.', formato: 'n', donde: 'kpis/canales',
    definicion: 'Mensajes intercambiados por lead, humanos y de la IA.',
  },
  canal_mas_leads: {
    nombre: 'Canal con más leads', formato: 'n', donde: 'kpis/canales',
    definicion: 'Canal que recibió la mayor cantidad de leads.',
  },
  canal_mas_ventas: {
    nombre: 'Canal con más ventas', formato: 'n', donde: 'kpis/canales',
    definicion: 'Canal que produjo la mayor cantidad de ventas.',
  },
  mejor_conversion_canal: {
    nombre: 'Mejor conversión', formato: 'pct', donde: 'kpis/canales',
    definicion: 'Mayor tasa de conversión entre los canales.',
  },

  /* ── equipo ──────────────────────────────────────────────────────────── */
  conv_cruda: {
    nombre: 'Conversión cruda', formato: 'pct', donde: 'kpis/equipo',
    definicion: 'Ventas de cada vendedor sobre el total de leads que recibió.',
  },
  conv_pagado: {
    nombre: 'Conversión en canal pagado', formato: 'pct', donde: 'kpis/equipo',
    definicion: 'Ventas de cada vendedor sobre los leads que recibió del canal pagado.',
  },
  leads_pagado: {
    nombre: 'Leads pagados', formato: 'n', donde: 'kpis/equipo',
    definicion: 'Leads del canal pagado que recibió cada vendedor.',
  },
  pct_organico: {
    nombre: '% leads orgánicos', formato: 'pct', donde: 'kpis/equipo',
    definicion: 'Porcentaje de leads orgánicos que recibió cada vendedor.',
  },
  brecha_equipo: {
    nombre: 'Brecha en el equipo', formato: 'x', donde: 'kpis/panorama',
    definicion: 'Razón entre la mayor y la menor conversión de vendedores en el canal pagado.',
  },
  escalados: {
    nombre: 'Escalados', formato: 'n', donde: 'kpis/equipo',
    definicion: 'Leads que la IA le pasó a esta persona para que siguiera la conversación.',
  },
  sin_contestar: {
    nombre: 'No contestó', formato: 'pct', donde: 'kpis/equipo',
    definicion: 'Leads escalados que no recibieron un mensaje del vendedor, sobre el total escalado.',
  },
  cartera_vendedor: {
    nombre: 'Leads activos por vendedor', formato: 'n', donde: 'kpis/equipo',
    definicion: 'Leads abiertos del vendedor que se movieron en los últimos 90 días.',
  },
  parados_vendedor: {
    nombre: 'Parados +90 días por vendedor', formato: 'n', donde: 'kpis/equipo',
    definicion: 'Leads abiertos del vendedor que llevan más de 90 días sin cambiar de etapa.',
  },
} as const satisfies Record<string, Metrica>

export type ClaveMetrica = keyof typeof CATALOGO

export const met = (id: ClaveMetrica): Metrica => CATALOGO[id]

const FORMATO: Record<Formato, (x: number | null | undefined) => string> =
  { n: n0, pct: pct1, dias: dias1, x: veces1 }

/** Formatea un valor según el formato declarado de su métrica. */
export const fmt = (id: ClaveMetrica, x: number | null | undefined): string =>
  FORMATO[CATALOGO[id].formato](x)
