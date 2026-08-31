/*
 * CANALES — de dónde vienen los leads y dónde conviene poner el presupuesto.
 *
 * Se llamaba «Demanda» y era el único segmento nombrado con una abstracción:
 * Embudo y Equipo nombran el objeto y dejan la decisión en el subtítulo. Peor,
 * `demanda` ya significa otra cosa en este repo —`kpis/demanda.py` mide qué pide
 * el mercado: modelo, presupuesto, forma de pago— y ese corte no está en esta
 * pantalla ni en ninguna. Un segmento «Demanda» que no muestra `demanda` es una
 * trampa; renombrarlo además deja la palabra libre para cuando ese corte tenga
 * dónde vivir.
 *
 * La franja usa solo diagnósticos propios de esta pantalla: líderes por volumen
 * y ventas, y la mejor conversión. Los totales del negocio viven en Resumen;
 * el detalle y las comparaciones viven en los gráficos.
 *
 * La versión anterior eran tres tarjetas apiladas y ninguna contestaba la
 * pregunta del segmento:
 *
 *  · «Canales» repetía, con otra forma, la mezcla que ya está en Resumen.
 *  · «Campañas pagadas» era la tabla de orígenes del canal pagado, dibujada
 *    aparte de los otros nueve orígenes. Ahora es parte de la misma tabla, con
 *    su nombre de campaña en vez del id de Meta.
 *  · «Cómo rinde cada mes de entrada» era el MISMO `ConversionChart` de Resumen.
 *    Una pantalla de detalle se justifica mostrando lo que el resumen no puede,
 *    y acá eso es el tiempo adentro de cada canal: el agregado dice 4,5% y
 *    esconde una serie que fue de 7,2% a 1,5% mientras subía el volumen.
 *
 * EL ORDEN VA DE LO GRUESO A LO FINO: arriba el canal —cómo se mueve en el
 * tiempo, y al lado cuál rinde mejor, que son la misma pregunta mirada de dos
 * maneras— y abajo, a lo ancho, el grano de adentro del canal. La fila de
 * arriba es 2:1 porque la serie mensual necesita el ancho y el ranking son
 * cuatro filas.
 *
 * La tabla desplegable de fuentes y campañas salió: era la misma población del
 * ranking de fuentes, agrupada por canal — y ese agrupamiento ya está arriba, en
 * la comparación de canales. Las columnas que agregaba (leads, ventas y
 * conversión de cada fuente) están en el globo de su fila.
 *
 * Lo que falta para cerrar la pregunta de presupuesto es la inversión por canal,
 * que el export no trae: sin costo no hay CAC ni ROAS, y lo más cerca que se
 * puede llegar es «cuántas ventas produce cada canal», no «cuánto cuesta cada
 * venta». Está anotado en Metodología como el dato que más falta.
 */
import type { Dashboard } from '../types'
import type { Tile } from '../components/StripKpi'
import { StripKpi } from '../components/StripKpi'
import { Tarjeta, Resalte } from '../components/Tarjeta'
import { TendenciaCanales } from '../components/TendenciaCanales'
import { Origenes } from '../components/Origenes'
import { ComparacionCanales } from '../components/ComparacionCanales'
import { panorama } from '../kpis/panorama'
import { n0, pct1 } from '../format'
import { canalLabel } from '../theme'

export function PaginaCanales({ d }: { d: Dashboard }) {
  const p = panorama(d)

  const mejorOrigen = d.origenes.length
    ? d.origenes.reduce((a, b) => ((a.tasa_conversion ?? 0) >= (b.tasa_conversion ?? 0) ? a : b))
    : null

  const canalesConLeads = d.canales.filter((c) => c.leads > 0)
  const masLeads = canalesConLeads.length
    ? canalesConLeads.reduce((a, b) => (a.leads >= b.leads ? a : b))
    : null
  const masVentas = canalesConLeads.length
    ? canalesConLeads.reduce((a, b) => (a.ganados >= b.ganados ? a : b))
    : null
  const canalesConConversion = canalesConLeads.filter((c) => c.tasa_conversion !== null)
  const mejorConversion = canalesConConversion.length
    ? canalesConConversion.reduce((a, b) => (
        (a.tasa_conversion ?? 0) >= (b.tasa_conversion ?? 0) ? a : b
      ))
    : null

  const tiles: Tile[] = [
    { id: 'canal_mas_leads', valor: masLeads ? canalLabel(masLeads.canal) : '—',
      nota: masLeads ? `${n0(masLeads.leads)} leads` : 'sin datos' },
    { id: 'canal_mas_ventas', valor: masVentas ? canalLabel(masVentas.canal) : '—',
      nota: masVentas ? `${n0(masVentas.ganados)} ventas` : 'sin datos' },
    { id: 'mejor_conversion_canal', valor: mejorConversion
        ? pct1(mejorConversion.tasa_conversion) : '—',
      nota: mejorConversion ? canalLabel(mejorConversion.canal) : 'sin datos' },
  ]

  return (
    <div className="tablero">
      <StripKpi tiles={tiles} ventanaDias={d.contexto.ventana_dias} />

      <div className="rejilla c23">
        <Tarjeta titulo="Evolución de cada canal"
                 /* La nota dice QUÉ conversión es y nada más: la tarjeta de al
                    lado publica otra conversión del mismo canal, y con «su
                    conversión» a secas las dos cifras se leen como la misma
                    medida mal calculada. Que se puedan elegir canales lo dicen
                    los botones, así que esa mitad de la nota salió. */
                 nota={`Qué parte de los leads de cada mes compró en sus primeros `
                   + `${d.contexto.ventana_dias} días`}
                 aside={p.lider && <Resalte rotulo="El canal más grande"
                                            valor={canalLabel(p.lider.canal)} />}
                 alto>
          <TendenciaCanales filas={d.canales_mes} ventanaDias={d.contexto.ventana_dias} />
        </Tarjeta>

        <Tarjeta titulo="Qué canal obtiene mejores resultados"
                 nota="Ordenados por ventas; la conversión cuenta las de cualquier fecha"
                 alto>
          <ComparacionCanales canales={d.canales} />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Cómo convierte cada fuente"
               nota="Adentro de un canal hay fuentes que rinden el doble que otras"
               aside={mejorOrigen && <Resalte rotulo="El que mejor convierte"
                                              valor={pct1(mejorOrigen.tasa_conversion)} />}>
        <Origenes origenes={d.origenes} />
      </Tarjeta>

    </div>
  )
}
