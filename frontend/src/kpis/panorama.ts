/*
 * LA LECTURA DE UNA PASADA. Lo que tiene que entender un gerente en cinco
 * segundos, antes de entrar a ninguna sección.
 *
 * Acá NO se calcula ningún KPI nuevo: todo sale de las filas que ya produjo
 * `agregar()` (o el API, que da exactamente las mismas). Esto solo las relee y
 * las ordena por importancia — que es una decisión de presentación, no de
 * negocio. Por eso vive en el front y no tiene gemelo en SQL.
 *
 * La regla que gobierna este archivo: si para armar un número hay que decidir
 * algo (qué cuenta como ganado, qué cuenta como transferido, dónde corta un
 * tramo), ese número NO se arma acá — se agrega como columna derivada en
 * backend/snapshot/build.py y se calcula en los dos lados.
 */
import type { CanalRow, CohorteRow, Dashboard, EtapaRow, VendedorRow } from '../types'

/** Un paso del recorrido del lead, de la entrada a la venta. */
export interface Paso {
  rotulo: string
  valor: number
  /** % sobre el primer paso: cuánto del total original sobrevive hasta acá. */
  share: number
  /** % que se pierde respecto del paso anterior. null en el primero. */
  caida: number | null
  /**
   * Leads que estaban en el paso anterior y no llegaron a este. Es el numerador
   * de `caida`, que ya se calculaba acá: un porcentaje solo no dice si son 349
   * personas o 10.306, y esa diferencia es la que decide dónde se trabaja.
   */
  perdidos: number | null
  /** Cuánto del ancho de entrada ocupaba el paso anterior. Dibuja la escalera:
   *  `share + perdidosShare` de una fila termina donde terminaba la de arriba. */
  shareAnterior: number
  esVenta: boolean
}

/**
 * El paso entre dos etapas donde se cae la mayor parte de los que habían
 * llegado. Es un MÁXIMO sobre las caídas que `flujo` ya calculó —como `lider` o
 * `brecha`—, no un umbral ni un juicio: si el embudo pierde parejo, devuelve el
 * primero y eso es la respuesta correcta.
 *
 * Se mide en porcentaje del paso anterior, no en leads perdidos, porque son dos
 * preguntas distintas: el primer salto del embudo pierde 10.306 leads y es lo
 * normal (mucha gente nunca contesta); el salto más caro en porcentaje es el que
 * se sale del patrón. Por eso `perdidos` viaja al lado — el % dice dónde mirar y
 * el absoluto, cuánto vale arreglarlo.
 */
export interface Salto {
  desde: string
  hasta: string
  caida: number
  perdidos: number
}

/** La etapa con la mayor mediana de permanencia. Es un máximo sobre tiempos ya
 * calculados; no inventa un umbral para decidir cuándo una etapa es lenta. */
export interface EtapaLenta {
  etapa: string
  dias: number
}

export interface Riesgo {
  id: string
  rotulo: string
  valor: string
  detalle: string
  nivel: 'malo' | 'alerta'
}

/** Variación entre los dos últimos meses COMPARABLES. */
export interface Variacion {
  /** Diferencia absoluta, en la unidad de la métrica (puntos, si es una tasa). */
  delta: number
  /** Diferencia relativa en %. Es la que sirve para los conteos. */
  relativo: number
  desde: string
  hasta: string
}

/**
 * La cartera con la que de verdad se puede contar: abiertos MENOS los parados
 * hace más de 90 días. Los 14.361 abiertos incluyen 8.738 que no se mueven hace
 * meses; presentar ese total como pipeline infla el pronóstico en un 61%.
 */
export interface Cartera {
  abiertos: number
  viva: number
  detenida: number
  /** % de la cartera abierta que está parada. */
  podrida: number
}

/**
 * El canal más grande por volumen, con sus dos pesos al lado. NO decide nada:
 * «el más grande» es un máximo, no un juicio — por eso puede vivir acá y no
 * necesita gemelo en SQL.
 *
 * Las dos cifras juntas son la pregunta de presupuesto en dos números: el canal
 * pagado trae el 44,6% de los leads y produce el 20,2% de las ventas. Cada una
 * por separado no dice nada; la distancia entre las dos sí.
 */
export interface Peso {
  canal: string
  /** % de los leads del período que trae. */
  pesoLeads: number
  /** % de las ventas del período que produce. */
  pesoVentas: number
}

/**
 * Cuántas veces convierte mejor el mejor canal que el más grande. Es el tamaño
 * de lo que hay en juego al mover un peso de presupuesto: 24,7% contra 4,5% son
 * 5,5 veces, y esa distancia no está a la vista en ninguna otra cifra del panel
 * —la tabla la tiene en dos filas separadas por dos canales.
 *
 * Son dos MÁXIMOS, no un umbral: el mejor por tasa y el más grande por volumen.
 * Si el canal más grande es además el que mejor convierte, da 1,0× y eso es la
 * respuesta correcta: no hay nada que reasignar.
 */
export interface Brecha {
  veces: number
  mejor: string
  tasaMejor: number
  lider: string
  tasaLider: number
}

/**
 * El equipo leído de una pasada: quién cierra mejor y quién deja pasar lo que le
 * escalan, medidos donde la comparación es justa.
 *
 * Los dos extremos salen del canal pagado y no de la tasa cruda. La brecha
 * cruda del equipo es 4,9× (20,7% contra 4,2%) y casi toda es reparto de leads:
 * el primero recibe 33,8% de leads orgánicos y el último 7,6%. Medidos donde
 * todos reciben lo mismo la brecha cae a 1,9×, y ESA es la que se le puede pedir
 * a alguien que cierre.
 *
 * Son máximos y mínimos sobre filas ya calculadas, no un umbral: por eso viven
 * acá y no necesitan gemelo en SQL.
 */
export interface Plantel {
  /** null cuando el filtro deja al equipo sin leads pagados: ahí no hay dónde
   *  comparar y la pregunta «quién cierra mejor» no tiene respuesta honesta.
   *  Va aparte del resto porque lo de responder NO depende de que exista: con un
   *  filtro por canal orgánico se sigue pudiendo decir quién no contesta. */
  cierre: {
    mejor: VendedorRow
    peor: VendedorRow
    /** Cuántas veces convierte mejor el primero que el último, en canal pagado. */
    brecha: number
    /** La misma brecha sobre la tasa cruda: el tamaño del espejismo. */
    brechaCruda: number | null
  } | null
  /** % de los escalados del equipo que nunca recibió un mensaje humano. Es la
   *  vara de la columna «No contestó»: lo que importa de una persona ahí es
   *  estar peor que el resto, no cruzar un umbral elegido a mano. */
  tasaSinRespuesta: number | null
}

export interface Panorama {
  flujo: Paso[]
  /** El salto más caro del recorrido. null cuando el filtro deja menos de dos pasos. */
  saltoCaro: Salto | null
  /** null cuando ninguna etapa tiene tiempos medibles en la selección. */
  etapaLenta: EtapaLenta | null
  cartera: Cartera
  serie: CohorteRow[]
  /** Solo los meses que ya cumplieron la ventana entera: los comparables. */
  comparables: CohorteRow[]
  /** Conversión a la ventana del conjunto de esos meses. Es la referencia contra
   *  la que se lee si un mes anduvo bien o mal. Ponderada por volumen, no
   *  promedio de promedios: un mes de 1.275 leads no puede pesar igual que uno
   *  de 5.035. */
  promedioComparable: number | null
  /**
   * Variaciones que se pueden calcular honestamente: `cohortes` trae leads,
   * ganados y tasa por mes, y nada más. Las demás métricas del panel no tienen
   * serie mensual, así que NO llevan variación — una celda vacía es correcta y
   * un número inventado no.
   */
  tendencia: { conversion: Variacion | null; leads: Variacion | null; ventas: Variacion | null }
  mezcla: (CanalRow & { share: number })[]
  /** El más grande por volumen. null cuando el filtro no deja ningún canal con leads. */
  lider: Peso | null
  /** El que más ventas produce, que casi nunca es el más grande: orgánico saca
   *  el 34,0% de las ventas con el 13,6% del volumen. */
  motor: Peso | null
  /** null si el canal más grande no tiene tasa, o la tiene en cero. */
  brecha: Brecha | null
  /** null si el filtro deja menos de dos vendedores con leads pagados. */
  plantel: Plantel | null
  riesgos: Riesgo[]
}

const pctDe = (num: number, den: number): number => (den ? (100 * num) / den : 0)

/**
 * El recorrido completo: las etapas del embudo (por etapa ALCANZADA) y la venta
 * al final. La venta se agrega desde `resumen` porque el embudo excluye las
 * etapas terminales — sin ella el recorrido se corta justo antes del resultado.
 */
function flujo(d: Dashboard): Paso[] {
  const etapas = d.embudo.filter((e) => e.alcanzaron > 0)
  if (!etapas.length) return []
  const base = etapas[0]!.alcanzaron
  const pasos = etapas.map((e) => ({ rotulo: e.etapa, valor: e.alcanzaron, esVenta: false }))
  pasos.push({ rotulo: 'Venta', valor: d.resumen.ganados, esVenta: true })
  return pasos.map((p, i) => {
    const previo = i ? pasos[i - 1]!.valor : p.valor
    return {
      ...p,
      share: pctDe(p.valor, base),
      caida: i ? pctDe(previo - p.valor, previo) : null,
      perdidos: i ? previo - p.valor : null,
      shareAnterior: pctDe(previo, base),
    }
  })
}

/* Recorre de a pares y se queda con la caída más grande. Comparación estricta a
   propósito: con dos saltos iguales gana el que viene primero, así el mismo dato
   siempre señala la misma fila. */
function saltoCaro(pasos: Paso[]): Salto | null {
  let peor: Salto | null = null
  pasos.forEach((p, i) => {
    if (!i || p.caida === null || p.perdidos === null) return
    if (peor && p.caida <= peor.caida) return
    peor = { desde: pasos[i - 1]!.rotulo, hasta: p.rotulo, caida: p.caida, perdidos: p.perdidos }
  })
  return peor
}

/* Comparación estricta: con dos etapas empatadas gana la primera del embudo, de
   modo que el mismo dato siempre produce el mismo titular. */
function etapaLenta(etapas: EtapaRow[]): EtapaLenta | null {
  const medibles = etapas.filter((e) => e.dias_mediana !== null)
  if (!medibles.length) return null
  const lenta = medibles.reduce((a, b) => (
    b.dias_mediana! > a.dias_mediana! ? b : a
  ))
  return { etapa: lenta.etapa, dias: lenta.dias_mediana! }
}

/**
 * Riesgos operativos, ordenados por lo que cuesta no mirarlos. Un riesgo que no
 * aplica a la selección no aparece: preferimos una tarjeta menos a una tarjeta
 * en cero que se lee como "esto está resuelto".
 */
function riesgos(d: Dashboard): Riesgo[] {
  const out: Riesgo[] = []
  const r = d.resumen

  if (r.handoff_sin_respuesta > 0) {
    out.push({
      id: 'handoff', nivel: 'malo', rotulo: 'Escalados sin respuesta',
      valor: r.handoff_sin_respuesta.toLocaleString('es-CL'),
      detalle: 'la IA los pasó a un vendedor y nadie contestó nunca',
    })
  }

  const viejos = d.estancados.reduce((a, e) => a + e.d90_mas, 0)
  if (viejos > 0) {
    out.push({
      id: 'cartera', nivel: 'alerta', rotulo: 'Parados hace +90 días',
      valor: viejos.toLocaleString('es-CL'),
      detalle: `${pctDe(viejos, r.abiertos).toFixed(0)}% de la cartera abierta`,
    })
  }

  if (r.tasa_no_show !== null && r.tasa_no_show > 0) {
    out.push({
      id: 'noshow', nivel: 'alerta', rotulo: 'Leads con no-show',
      valor: `${r.tasa_no_show.toFixed(1).replace('.', ',')}%`,
      detalle: 'leads que faltaron a al menos una cita agendada',
    })
  }

  return out
}

/* Solo entre meses COMPARABLES, y sobre la cifra de la ventana. Comparar el
   resultado final del último mes del export sería compararse contra un mes que
   todavía está convirtiendo, y el panel mostraría un derrumbe que no existe. */
const variacion = <T extends { mes: string }>(
  a: T | undefined, b: T | undefined, valor: (fila: T) => number | null,
): Variacion | null => {
  if (!a || !b) return null
  const [x, y] = [valor(a), valor(b)]
  if (x === null || y === null || !x) return null
  return { delta: y - x, relativo: (100 * (y - x)) / x, desde: a.mes, hasta: b.mes }
}

const peso = (c: CanalRow, d: Dashboard): Peso => ({
  canal: c.canal,
  pesoLeads: pctDe(c.leads, d.resumen.leads),
  pesoVentas: pctDe(c.ganados, d.resumen.ganados),
})

const conLeads = (d: Dashboard): CanalRow[] => d.canales.filter((c) => c.leads > 0)

/* El más grande por VOLUMEN, no por ventas ni por tasa: el volumen es lo que se
   compra con presupuesto, y es la cifra contra la que se lee el aporte. */
function lider(d: Dashboard): Peso | null {
  const cs = conLeads(d)
  if (!cs.length) return null
  return peso(cs.reduce((a, b) => (a.leads >= b.leads ? a : b)), d)
}

/* El que más VENTAS produce. Por ventas y no por tasa: la tasa sola premia a un
   canal de 200 leads que no mueve el resultado, y acá la cifra que se muestra es
   qué parte de las ventas del período depende de ese canal. */
function motor(d: Dashboard): Peso | null {
  const cs = conLeads(d)
  if (!cs.length) return null
  return peso(cs.reduce((a, b) => (a.ganados >= b.ganados ? a : b)), d)
}

function brecha(d: Dashboard): Brecha | null {
  const cs = conLeads(d).filter((c) => c.tasa_conversion !== null)
  if (cs.length < 2) return null
  const grande = cs.reduce((a, b) => (a.leads >= b.leads ? a : b))
  const mejor = cs.reduce((a, b) => (a.tasa_conversion! >= b.tasa_conversion! ? a : b))
  /* Sin tasa en el canal grande no hay divisor: un múltiplo contra cero se
     dibuja como infinito y se lee como un dato. */
  if (!grande.tasa_conversion) return null
  return {
    veces: mejor.tasa_conversion! / grande.tasa_conversion,
    mejor: mejor.canal, tasaMejor: mejor.tasa_conversion!,
    lider: grande.canal, tasaLider: grande.tasa_conversion,
  }
}

/* El primero y el último del equipo medidos DONDE RECIBEN LO MISMO. Sobre la
   tasa cruda esta función devolvería otro par y otro múltiplo, y las dos cosas
   serían el ruteo de leads disfrazado de desempeño — por eso `brechaCruda`
   viaja al lado: el panel muestra las dos y la diferencia es el espejismo. */
function plantel(d: Dashboard): Plantel | null {
  if (!d.vendedores.length) return null

  const conEscalados = d.vendedores.filter((v) => v.escalados > 0)
  const escalados = conEscalados.reduce((a, v) => a + v.escalados, 0)
  const sinRespuesta = conEscalados.reduce((a, v) => a + v.sin_respuesta, 0)

  /* El peor y el total de escalados salían de acá para dos tarjetas que ya no
     existen: ahora los publica la tabla de Equipo, cada cifra en la columna de
     su persona y el total en el pie de esa misma columna. */
  return { cierre: cierre(d),
    tasaSinRespuesta: escalados ? (100 * sinRespuesta) / escalados : null }
}

function cierre(d: Dashboard): Plantel['cierre'] {
  const comparables = d.vendedores.filter((v) => v.tasa_en_pagado !== null && v.leads_pagado > 0)
  if (comparables.length < 2) return null
  const mejor = comparables.reduce((a, b) => (a.tasa_en_pagado! >= b.tasa_en_pagado! ? a : b))
  const peor = comparables.reduce((a, b) => (a.tasa_en_pagado! <= b.tasa_en_pagado! ? a : b))
  /* Sin tasa en el último no hay divisor: un múltiplo contra cero se dibuja como
     infinito y se lee como un dato. */
  if (!peor.tasa_en_pagado) return null

  const crudas = d.vendedores.filter((v) => v.tasa_cruda !== null && v.tasa_cruda > 0)
  return {
    mejor, peor,
    brecha: mejor.tasa_en_pagado! / peor.tasa_en_pagado,
    brechaCruda: crudas.length >= 2
      ? Math.max(...crudas.map((v) => v.tasa_cruda!)) / Math.min(...crudas.map((v) => v.tasa_cruda!))
      : null,
  }
}

export function panorama(d: Dashboard): Panorama {
  const pasos = flujo(d)
  const comparables = d.cohortes.filter((c) => c.medible && c.tasa_ventana !== null)
  const [penultima, ultima] = comparables.slice(-2)

  const detenida = d.estancados.reduce((a, e) => a + e.d90_mas, 0)
  const abiertos = d.resumen.abiertos
  const mesCorte = d.contexto.corte.slice(0, 7)
  const leadsCompletos = d.cohortes.filter((c) => c.mes !== mesCorte)
  const [leadsAnterior, leadsUltimo] = leadsCompletos.slice(-2)
  const ventasPorMes = new Map(d.ventas_mes.map((v) => [v.mes, v.ventas]))
  const ventasCompletas = leadsCompletos.map((c) => ({
    mes: c.mes, ventas: ventasPorMes.get(c.mes) ?? 0,
  }))
  const [ventasAnterior, ventasUltimo] = ventasCompletas.slice(-2)

  return {
    flujo: pasos,
    saltoCaro: saltoCaro(pasos),
    etapaLenta: etapaLenta(d.embudo),
    cartera: {
      abiertos, detenida, viva: abiertos - detenida, podrida: pctDe(detenida, abiertos),
    },
    serie: d.cohortes,
    comparables,
    promedioComparable: comparables.length
      ? pctDe(comparables.reduce(function (a, c) { return a + c.ganados_ventana }, 0),
              comparables.reduce(function (a, c) { return a + c.leads }, 0))
      : null,
    /* Ventas y leads comparan meses calendario completos. Conversión usa la
       ventana común: mezclar esas dos varas dentro de una misma píldora sería
       presentar una comparación distinta de la cifra que acompaña. */
    tendencia: {
      conversion: variacion(penultima, ultima, (c) => c.tasa_ventana),
      leads: variacion(leadsAnterior, leadsUltimo, (c) => c.leads),
      ventas: variacion(ventasAnterior, ventasUltimo, (c) => c.ventas),
    },
    mezcla: d.canales.map((c) => ({ ...c, share: pctDe(c.leads, d.resumen.leads) })),
    lider: lider(d),
    motor: motor(d),
    brecha: brecha(d),
    plantel: plantel(d),
    riesgos: riesgos(d),
  }
}
