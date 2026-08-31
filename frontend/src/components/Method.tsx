/*
 * La metodología, visible dentro del panel.
 *
 * Un tablero que dice "limpiamos los datos" sin mostrar qué sacó pide un acto de
 * fe. Acá está lo que se descartó, con qué regla y con qué medición — incluido
 * lo que se midió y resultó NO ser señal, que es lo que evita que alguien pida
 * un gráfico de ruido.
 */
export function Method({ ventanaDias, p75Venta, totalLeads }: {
  ventanaDias: number
  p75Venta: number | null
  totalLeads: number
}) {
  return (
    <details className="metodo" open>
      <summary>Cómo se calculó esto</summary>
      <div className="cuerpo">
        <div>
          <h4>De dónde salen los números</h4>
          <p>
            Un único export SQLite se carga tal cual a <code>raw</code>, se perfila y solo entonces se
            modela. Todo lo que se ve aquí sale de <code>analytics.fct_leads</code> — una fila por lead,
            {' '}{totalLeads.toLocaleString('es-CL')} en total — y de las tablas de hechos relacionadas con
            ella. Contar leads desde una tabla de grano más fino (mensajes, por ejemplo) infla el canal
            orgánico un 20,3%.
          </p>
        </div>
        <div>
          <h4>Qué se descartó y por qué</h4>
          <p>El ruido no está en una lista escrita a mano: lo detectan tres reglas estadísticas sobre
            los datos crudos.</p>
          <ul>
            <li><strong>Valor dominante</strong> — una columna donde un solo valor cubre más del 99% de
              las filas no informa nada. Detectó 10 columnas constantes y 53 campos de relleno.</li>
            <li><strong>Poder discriminante (eta²)</strong> — una métrica que no explica varianza contra
              su agrupador natural es ruido con forma de número. Descartó <code>duracion_ms</code>
              {' '}(eta² = 0,000028) y marcó <code>es_automatico</code> como redundante con
              {' '}<code>remitente_tipo</code>.</li>
            <li><strong>Frecuencia de clave JSON</strong> — 900 claves inyectadas en los payloads
              aparecían en menos del 1% de los documentos; las 13 reales aparecen en el 15,6% o más.</li>
          </ul>
        </div>
        <div>
          <h4>Los supuestos que hay que discutir</h4>
          <ul>
            <li><strong>Atribución first-touch.</strong> 1.761 leads (5,1%) tocaron varios canales y el
              98,2% se contradicen entre sí. Quedarse con el primer contacto mide <em>adquisición</em>;
              last-touch mediría <em>cierre</em>. Los toques completos quedan guardados, así que la
              decisión es reversible.</li>
            <li><strong>«Ganado» se identifica por nombre, no por orden.</strong> Hay dos etapas
              terminales y el esquema no dice cuál es el éxito.</li>
            <li><strong>La conversión se mide sobre todos los leads, no solo los cerrados.</strong> Un
              lead abandonado que nunca se marcó «Perdido» es una venta que no ocurrió; medir solo sobre
              cerrados premia no cerrar.</li>
            <li><strong>Los meses se comparan a la misma edad: {ventanaDias} días.</strong> Cada mes
              se mide por las ventas ocurridas dentro de los primeros {ventanaDias} días de sus
              leads, y un mes entra al gráfico cuando su último lead ya cumplió ese plazo. Comparar
              el resultado <em>acumulado</em> de un mes de 350 días contra uno de 46 mide la edad de
              las cohortes y no el negocio: con el acumulado la conversión parecía caer de 12,3% a
              10,6%, y a igual edad viene subiendo de 3,0% a 5,1%. Es el problema que en estadística
              se llama censura por la derecha, y la corrección es la estándar (<em>vintage
              analysis</em>).</li>
            <li><strong>La ventana es una decisión, no una medición.</strong> Vive en
              {' '}<code>backend/etl/config.yml → cohortes.ventana_dias</code> con su justificación.
              {p75Venta !== null && <> El ciclo real es más largo que la ventana: tres de cada cuatro
                ventas ocurren dentro de {Math.round(p75Venta)} días desde que entró el lead, así que
                la ventana mide la primera parte de cada mes —cerca de un tercio de sus ventas—, no
                todas.</>} Subirla mide más de cada mes y deja menos meses comparables; con 30 días
              son 12 de 13 meses, con 93 serían 9.</li>
            <li><strong>No hay costo por canal en el export.</strong> Sin inversión publicitaria no se
              puede calcular CAC ni ROAS, que es lo que de verdad cerraría la pregunta de presupuesto.
              Es el dato que más falta.</li>
          </ul>
        </div>
        <div>
          <h4>Lo que se midió y resultó no ser señal</h4>
          <p>
            El no-show es prácticamente idéntico entre sucursales y tipos de cita (25,1% a 25,9%): no
            hay una sucursal con un problema. El <code>score</code> de calificación del asistente no
            correlaciona con su propia bandera de calificado, y el <code>lifecyclestage</code> del CRM
            se reparte 20% uniforme sin relación con la etapa real. Ninguno se grafica: un panel que
            muestra ruido con forma de métrica hace tomar decisiones sobre nada.
          </p>
        </div>
      </div>
    </details>
  )
}
