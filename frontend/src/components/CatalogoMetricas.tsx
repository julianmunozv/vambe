/*
 * El diccionario de métricas, visible dentro del panel.
 *
 * Sale de kpis/catalogo.ts — la misma fuente que rotula las tablas y explica las
 * cifras al apuntarlas. Está acá para que la pregunta «¿de dónde sale este
 * número?» se conteste sin abrir el repo, y para que quien sí lo abra sepa
 * exactamente qué archivo tocar.
 */
import { CATALOGO } from '../kpis/catalogo'

const FORMATO: Record<string, string> = { n: 'conteo', pct: 'porcentaje', dias: 'días', x: 'múltiplo' }

export function CatalogoMetricas() {
  return (
    <div className="envoltura">
      <table className="datos diccionario">
        <thead>
          <tr>
            <th scope="col">Métrica</th>
            <th scope="col">Qué mide</th>
            <th scope="col">Formato</th>
            <th scope="col">Se calcula en</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(CATALOGO).map(([id, m]) => (
            <tr key={id}>
              <td><strong>{m.nombre}</strong></td>
              <td className="definicion">{m.definicion}</td>
              <td>{FORMATO[m.formato]}</td>
              {/* Solo el .py: es donde el número se calcula de verdad, en SQL
                  contra Postgres. Existe un gemelo .ts con el mismo nombre, pero
                  no corre en el navegador — es el contraste de `npm run verify`,
                  y ponerlo acá haría pensar que la métrica se calcula dos veces
                  en vivo.
                  La excepción es panorama: no tiene gemelo en SQL porque no
                  calcula nada de negocio, solo relee filas ya calculadas. Su
                  ruta es la del front, y decir «backend/api/kpis/panorama.py»
                  mandaba a auditar un archivo que no existe. */}
              <td><span className="mono">
                {m.donde === 'kpis/panorama'
                  ? 'frontend/src/kpis/panorama.ts'
                  : `${m.donde.replace('kpis/', 'backend/api/kpis/')}.py`}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
