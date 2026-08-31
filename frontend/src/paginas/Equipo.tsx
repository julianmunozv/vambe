/*
 * EQUIPO — quién atiende y cómo responde.
 *
 * Acá vive TODA la atención al lead: el asistente que contesta primero, el
 * traspaso a una persona y el vendedor que cierra. Antes el asistente tenía su
 * propio segmento («Operación IA»), y eso partía en dos una misma pregunta: al
 * gerente no le sirve saber cómo va la IA por separado, le sirve saber si al
 * lead lo atendieron. El hallazgo más caro del panel — 2.233 leads escalados que
 * nadie contestó — cae justo en la costura entre los dos.
 *
 * UNA TABLA Y NADA MÁS: una fila por persona.
 *
 * La versión anterior tenía cinco indicadores en franja y cuatro tarjetas para
 * ocho personas. Dos de esas tarjetas —el ranking de cierre y el ranking de
 * respuesta— eran dos columnas de la tabla dibujadas como barras: la misma cifra
 * tres veces, y ninguna de las tres decía nada que la fila de la persona no
 * dijera mejor. Con una sola tabla, las tres preguntas que se le pueden hacer a
 * alguien quedan en el mismo renglón:
 *
 *   cierra    conversión en el canal pagado, con la cruda al lado como espejismo
 *   responde  qué parte de lo que le transfieren deja sin contestar
 *   sostiene  con qué cartera se quedó, y cuánta está parada hace meses
 *
 * Y LA FRANJA DE INDICADORES SALIÓ. Tres de los cinco eran la misma cifra que la
 * tabla ya publica (los escalados, los que quedaron sin respuesta, la conversión
 * del equipo en pagado, ahora en el pie de su columna) y el otro —el no-show— no
 * cambia ninguna decisión de este segmento: va de 14,9% a 16,9% entre las ocho
 * personas, o sea que no hay a quién pedirle nada. Sigue servido en /api/no-show.
 *
 * Y LA COMPARACIÓN DEL TRASPASO TAMBIÉN SALIÓ. Era la tarjeta de arriba: dos
 * barras con la conversión de los leads transferidos que recibieron respuesta
 * (11,1%) contra los que no (3,1%). Publicaba UN hallazgo, no una decisión de
 * este segmento — a quién pedirle qué se contesta en la fila de la persona, y la
 * columna «No contestó» ya reparte esos mismos 2.233 leads entre las ocho, que
 * es la forma accionable del mismo dato. El hallazgo sigue publicado donde
 * corresponde: en «Qué hay que arreglar» del Resumen (`kpis/hallazgos.ts`), con
 * su acción al lado, y los tramos completos siguen servidos en /api/handoff.
 *
 * La tasa cruda va apagada a propósito: mide sobre todo qué leads le tocaron a
 * cada quien, y publicarla sola haría que la gerencia premie el ruteo. Por eso
 * viaja pegada a su confusor —la parte de leads orgánicos que recibió— y por eso
 * el orden de las filas es por la comparable.
 *
 * La tabla de herramientas del asistente estuvo acá y salió del panel: una tasa
 * de falla por tool es un bug de integración con dueño en producto, y nadie de
 * comercial hace nada distinto según lo que diga. Sigue calculada y servida en
 * /api/herramientas y se contrasta con su gemelo en TypeScript.
 */
import { useMemo, useState } from 'react'
import type { Dashboard, VendedorRow } from '../types'
import type { Columna, Orden } from '../components/DataTable'
import { DataTable } from '../components/DataTable'
import { Tarjeta } from '../components/Tarjeta'
import { panorama } from '../kpis/panorama'
import { fmt } from '../kpis/catalogo'
import { n0 } from '../format'

/** Suma de una columna sobre las filas visibles. El pie de una columna es el
 *  total de ESA columna y no la cifra equivalente de otro KPI: con un filtro
 *  puesto, un total que no sale de las mismas filas se lee como un error de
 *  cuadratura aunque los dos números estén bien. */
const suma = (vs: VendedorRow[], f: (v: VendedorRow) => number): number =>
  vs.reduce((a, v) => a + f(v), 0)

/* El orden con el que abre la tarjeta. Es una decisión editorial, no un default
   técnico: la conversión en el canal pagado es la única columna donde todos
   reciben el mismo tipo de lead, así que es la única que ordena por desempeño y
   no por el reparto de leads. Quien quiera otra la pide con un clic. */
const ORDEN_INICIAL: Orden = { clave: 'pagado', dir: 'desc' }

export function PaginaEquipo({ d }: { d: Dashboard }) {
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const p = panorama(d)
  const r = d.resumen
  const q = p.plantel
  const vs = d.vendedores

  /* La vara del equipo en el canal pagado sale de la fila del canal, no de
     promediar a los vendedores: promediar promedios le daría el mismo peso a
     quien recibió 1.879 leads pagados que a quien recibió 1.979. */
  const promedioPagado = d.canales.find((x) => x.canal === 'ad')?.tasa_conversion ?? null
  /* Misma razón para la mezcla: la parte orgánica del equipo es la del total de
     leads, no el promedio de ocho porcentajes. */
  const organicoEquipo = p.mezcla.find((m) => m.canal === 'organico')?.share ?? null

  /* La vara contra la que se pinta la columna «No contestó»: el equipo, no un
     umbral elegido. Lo que importa es quién está peor que el resto. */
  const promedioSinRespuesta = q?.tasaSinRespuesta ?? null

  const cols = useMemo<Columna<VendedorRow>[]>(() => [
    { clave: 'nombre', titulo: 'Vendedor', orden: (v) => v.nombre,
      celda: (v) => v.nombre, pie: 'Todo el equipo' },

    /* cierra — la comparable manda y la cruda queda al lado, apagada, con la
       mezcla que la explica pegada a ella. El hilo bajo la conversión en pagado
       es el orden de la tabla hecho visible: con ocho filas, ver quién está
       lejos del resto cuesta menos que comparar ocho cifras de tres dígitos. */
    { clave: 'pagados', grupo: 'Cierra', metrica: 'leads_pagado', orden: (v) => v.leads_pagado,
      celda: (v) => n0(v.leads_pagado), pie: n0(suma(vs, (v) => v.leads_pagado)) },
    { clave: 'pagado', grupo: 'Cierra', metrica: 'conv_pagado', titulo: 'Conv. en pagado',
      destacada: true, barra: (v) => v.tasa_en_pagado, orden: (v) => v.tasa_en_pagado,
      celda: (v) => fmt('conv_pagado', v.tasa_en_pagado),
      pie: fmt('conv_pagado', promedioPagado) },
    { clave: 'cruda', grupo: 'Cierra', metrica: 'conv_cruda', titulo: 'Conv. total', apagada: true,
      orden: (v) => v.tasa_cruda, celda: (v) => fmt('conv_cruda', v.tasa_cruda),
      pie: fmt('conv_cruda', r.tasa_conversion) },
    { clave: 'organico', grupo: 'Cierra', metrica: 'pct_organico', titulo: '% orgánicos',
      apagada: true, orden: (v) => v.pct_organico, celda: (v) => fmt('pct_organico', v.pct_organico),
      pie: fmt('pct_organico', organicoEquipo) },

    /* responde — el porcentaje es lo comparable entre personas que reciben
       volúmenes distintos, y la cantidad al lado es de qué tamaño es el arreglo:
       sola premiaría a quien recibe menos leads. */
    { clave: 'escalados', grupo: 'Responde', metrica: 'escalados', titulo: 'Transferidos',
      orden: (v) => v.escalados,
      celda: (v) => n0(v.escalados), pie: n0(suma(vs, (v) => v.escalados)) },
    /* Sin hilo, a diferencia de la conversión en pagado: la celda son dos cifras
       y la pista va anclada al borde derecho, así que el hilo caía justo debajo
       del «· 239» y se leía como la barra de ESE número. Acá el orden lo marca
       el rojo, que además dice contra qué: el promedio del equipo. */
    { clave: 'sinresp', grupo: 'Responde', metrica: 'sin_contestar', destacada: true,
      orden: (v) => v.tasa_sin_respuesta,
      celda: (v) => (
        <>
          <span style={{
            color: v.tasa_sin_respuesta != null && promedioSinRespuesta != null
              && v.tasa_sin_respuesta > promedioSinRespuesta ? 'var(--malo)' : 'var(--ink)',
          }}>
            {fmt('sin_contestar', v.tasa_sin_respuesta)}
          </span>
          <span className="apagado"> · {n0(v.sin_respuesta)}</span>
        </>),
      pie: <>
        {fmt('sin_contestar', promedioSinRespuesta)}
        <span className="apagado"> · {n0(suma(vs, (v) => v.sin_respuesta))}</span>
      </> },

    /* sostiene — la cartera con la que se puede contar y la que hay que
       desatascar o dar por perdida. */
    { clave: 'viva', grupo: 'Sostiene', metrica: 'cartera_vendedor', titulo: 'Leads activos',
      orden: (v) => v.abiertos - v.detenidos,
      celda: (v) => fmt('cartera_vendedor', v.abiertos - v.detenidos),
      pie: fmt('cartera_vendedor', suma(vs, (v) => v.abiertos - v.detenidos)) },
    { clave: 'parados', grupo: 'Sostiene', metrica: 'parados_vendedor', titulo: '+90 días',
      orden: (v) => v.detenidos, celda: (v) => fmt('parados_vendedor', v.detenidos),
      pie: fmt('parados_vendedor', suma(vs, (v) => v.detenidos)) },
  ], [vs, promedioPagado, organicoEquipo, promedioSinRespuesta, r.tasa_conversion])

  return (
    <div className="tablero">
      <Tarjeta titulo="Vendedor por vendedor"
               nota="Cómo cierra, qué contesta de lo que le transfieren y con qué cartera se quedó">
        {/* Sin resaltes en la esquina y sin pie de texto. Lo que decían —la brecha
            entre el mejor y el peor, qué columna ordena, por qué la cruda va
            apagada, qué marca el rojo— lo dice la tabla misma: la flecha del
            encabezado activo, el gris de las columnas de contexto, el hilo bajo
            la conversión en pagado y la definición de cada métrica al apuntar su
            rótulo. Una cifra resumen al lado de las ocho filas que la producen
            es la misma lectura dos veces. */}
        <DataTable columnas={cols} filas={vs} claveFila={(v) => v.nombre}
                   orden={orden} onOrden={setOrden} />
      </Tarjeta>
    </div>
  )
}
