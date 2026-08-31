/*
 * El contrato del panel.
 *
 * `Dashboard` es lo que renderiza la UI, y hay DOS implementaciones que lo
 * producen: el API (backend/api/kpis/), que es la que alimenta el panel, y la
 * de TypeScript (src/kpis/), que no alimenta nada y existe para contrastarla.
 * Que el tipo sea uno solo es lo que permite compararlas — y `npm run verify`
 * comprueba que además coinciden en los números, no solo en la forma.
 */

export interface Filtros {
  canal: string[]
  embudo: string[]
  ciudad: string[]
  tipo_vehiculo: string[]
  vendedor: string[]
  desde: string | null   // 'YYYY-MM' inclusive
  hasta: string | null   // 'YYYY-MM' inclusive
}

export const FILTROS_VACIOS: Filtros = {
  canal: [], embudo: [], ciudad: [], tipo_vehiculo: [], vendedor: [],
  desde: null, hasta: null,
}

export interface Contexto {
  corte: string
  inicio: string
  /** La ventana de observación de las cohortes, en días: dentro de cuántos días
   *  desde su entrada se cuenta la venta de un lead, y la edad mínima que
   *  necesita un mes para poder compararse con otro. Se declara en
   *  `backend/etl/config.yml → cohortes.ventana_dias`. */
  ventana_dias: number
  /** Plazo real dentro del que ocurren 3 de cada 4 ventas, contando desde que
   *  entró el lead. Medido, no declarado: es lo que hace visible en Metodología
   *  cuánto del ciclo cae fuera de la ventana. */
  p75_dias_a_venta: number | null
  /** Días entre el primer y el último lead del dataset. La edad de una cohorte
   *  se mide contra esto y no contra el rango filtrado. */
  dia_corte: number
}

export interface Resumen {
  leads: number
  ganados: number
  cerrados: number
  abiertos: number
  tasa_conversion: number | null
  tasa_test_drive: number | null
  tasa_transferencia: number | null
  handoff_sin_respuesta: number
  tasa_handoff_perdido: number | null
  tasa_no_show: number | null
  dias_mediana: number | null
  /** Ciclo de venta: mediana de días SOLO entre los leads ganados. Es distinto
   *  de `dias_mediana`, que incluye a los que mueren rápido y sale menos de la
   *  mitad (25,0 d contra 11,2 d). */
  dias_a_venta: number | null
}

export interface CanalRow {
  canal: string
  leads: number
  ganados: number
  tasa_conversion: number | null
  tasa_test_drive: number | null
  dias_promedio: number | null
  mensajes_promedio: number | null
}

/** Un canal en un mes. El grano que `CanalRow` no puede tener. */
export interface CanalMesRow {
  mes: string
  canal: string
  leads: number
  ganados: number
  tasa_conversion: number | null
  /** Ventas ocurridas dentro de los primeros `contexto.ventana_dias` del lead.
   *  Es la serie que se dibuja: la única comparable entre meses. */
  ganados_ventana: number
  tasa_ventana: number | null
  /** false = el mes todavía no cumplió la ventana entera, así que su cifra va a
   *  seguir subiendo. Se decide por MES, no por mes×canal: así las cuatro líneas
   *  se cortan en el mismo punto. Es la misma marca que trae `CohorteRow`. */
  medible: boolean
}

/** El canal abierto por la fuente concreta del lead. */
export interface OrigenRow {
  canal: string
  origen: string
  /** Nombre de la campaña si el origen es un aviso pagado; el slug del origen
   *  en el resto. El id numérico de Meta no le dice nada a nadie. */
  rotulo: string
  leads: number
  ganados: number
  tasa_conversion: number | null
  tasa_test_drive: number | null
  dias_promedio: number | null
  mensajes_promedio: number | null
}

/** Solo del endpoint /api/campanas: `OrigenRow` la contiene y el panel no la
 *  dibuja. Se mantiene porque la campaña también trae plataforma y objetivo. */
export interface CampanaRow {
  campana: string
  platform: string
  objetivo: string
  leads: number
  ganados: number
  tasa_conversion: number | null
  tasa_test_drive: number | null
}

export interface EtapaRow {
  etapa: string
  orden: number
  alcanzaron: number
  estancados_aqui: number
  dias_mediana: number | null
}

export interface EstancadoRow {
  etapa: string
  orden: number
  abiertos: number
  d0_7: number
  d8_30: number
  d31_90: number
  d90_mas: number
  dias_max: number
}

export interface CohorteRow {
  mes: string
  leads: number
  /** Ventas acumuladas hasta hoy. NO es comparable entre meses: un mes viejo
   *  tuvo más tiempo para juntarlas. Va al globo del gráfico, no a un eje. */
  ganados: number
  tasa_conversion: number | null
  /** Ventas ocurridas dentro de los primeros `contexto.ventana_dias` del lead.
   *  Todos los meses medidos a la misma edad: ESTA es la serie comparable. */
  ganados_ventana: number
  tasa_ventana: number | null
  abiertos: number
  /** false = el mes todavía no cumplió la ventana entera (su último lead es más
   *  joven que eso), así que su cifra va a seguir subiendo y no se dibuja. */
  medible: boolean
}

/** Ventas por mes de cierre. `mes` es cuando el lead llegó a Ganado, no
 * cuando entró al embudo. */
export interface VentaMesRow {
  mes: string
  ventas: number
}

export interface HandoffRow {
  tramo: string
  orden: number
  leads: number
  ganados: number
  tasa_conversion: number | null
}

/** Solo del endpoint /api/herramientas: el panel no la dibuja — la falla por
 *  tool es un bug de integración, no una decisión de negocio. */
export interface HerramientaRow {
  herramienta: string
  llamadas: number
  leads_tocados: number
  tasa_fallo: number | null
  conversion_de_tocados: number | null
}

/* Tres cosas de cada persona, que son las tres que se le pueden pedir:
   cómo cierra, si responde lo que la IA le pasa, y con qué cartera se quedó. */
export interface VendedorRow {
  nombre: string
  leads: number
  ganados: number
  /** Depende sobre todo de QUÉ leads le tocaron: se publica para mostrar el
   *  espejismo, nunca para rankear. */
  tasa_cruda: number | null
  /** La comparable: dentro del canal pagado todos reciben el mismo tipo de lead. */
  tasa_en_pagado: number | null
  leads_pagado: number
  pct_organico: number | null
  tasa_no_show: number | null
  /** Leads que la IA le escaló a esta persona. */
  escalados: number
  /** De esos, los que nunca recibieron un primer mensaje humano. */
  sin_respuesta: number
  /** `sin_respuesta` sobre `escalados`: la comparación justa entre personas que
   *  reciben volúmenes distintos. */
  tasa_sin_respuesta: number | null
  abiertos: number
  /** Abiertos parados hace más de 90 días. `abiertos - detenidos` es la cartera
   *  con la que esta persona puede contar de verdad. */
  detenidos: number
}

export interface Dashboard {
  contexto: Contexto
  resumen: Resumen
  ventas_mes: VentaMesRow[]
  canales: CanalRow[]
  canales_mes: CanalMesRow[]
  origenes: OrigenRow[]
  embudo: EtapaRow[]
  estancados: EstancadoRow[]
  cohortes: CohorteRow[]
  handoff: HandoffRow[]
  vendedores: VendedorRow[]
}

/* ── las filas crudas del arnés de verificación ────────────────────────────
 * Esto NO viaja al navegador: lo lee `npm run verify` desde
 * backend/snapshot/snapshot.json para correr los KPIs en TS y compararlos
 * contra el API.
 * Columnar (una lista por campo, no un objeto por lead): comprime mucho mejor
 * y el filtrado recorre enteros en vez de saltar entre objetos.
 * Todos los campos de texto viajan como índice a `dic`.
 */

export type ClaveDic =
  | 'canal' | 'embudo' | 'ciudad' | 'tipo_vehiculo' | 'mes' | 'vendedor'
  | 'campana' | 'platform' | 'objetivo' | 'modelo' | 'forma_pago' | 'origen'

export interface Columnas {
  ca: number[]; em: number[]; ci: number[]; tv: number[]; me: number[]; ve: number[]
  cp: number[]; pl: number[]; ob: number[]; mo: number[]; fp: number[]; og: number[]
  /** banderas ya decididas en SQL: ganado, ganado DENTRO de la ventana de
   *  observación, terminal, test drive, no-show, transferido, respondido por
   *  humano */
  g: number[]; gv: number[]; t: number[]; td: number[]; ns: number[]; tr: number[]; rh: number[]
  /** índice del tramo de SLA, también decidido en SQL */
  sla: number[]
  dias: number[]      // días en el embudo, -1 si no tuvo movimientos
  nmsg: number[]
  dia: number[]       // días desde el primer lead del dataset
  mg: number[]        // índice del mes de venta, -1 si no ganó
  eact: number[]      // orden de la etapa actual, 0 si es terminal
  dact: number[]      // días en la etapa actual, -1 si no aplica
}

export interface Snapshot {
  dataset_id: string
  contexto: Contexto
  n: number
  dic: Record<ClaveDic, string[]>
  etapas: string[]
  herramientas: string[]
  tramos: string[]
  col: Columnas
  /** días acumulados por lead en cada etapa; -1 = no la alcanzó */
  dias_etapa: number[][]
  tool_llamadas: number[][]
  tool_fallos: number[][]
}
