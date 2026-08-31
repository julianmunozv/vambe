/*
 * Barra de filtros. Un solo juego de filtros para todo el panel: si cada sección
 * filtrara por su cuenta, dos tarjetas podrían estar mirando poblaciones
 * distintas y nadie tendría cómo notarlo.
 *
 * Canal va en chips (multiselección, es la dimensión que más se cruza) y el
 * resto en selects, que ocupan menos y se usan de a uno.
 */
import type { Filtros } from '../types'
import type { Opciones } from '../data/source'
import { FILTROS_VACIOS } from '../types'
import { mesLargo } from '../format'
import { canalLabel } from '../theme'

function Select({ rotulo, valores, valor, onChange, formato }: {
  rotulo: string
  valores: string[]
  valor: string | null
  onChange: (v: string | null) => void
  formato?: (v: string) => string
}) {
  return (
    <select aria-label={rotulo} value={valor ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{rotulo}</option>
      {valores.map((v) => <option key={v} value={v}>{formato ? formato(v) : v}</option>)}
    </select>
  )
}

export function FilterBar({ opciones, filtros, onChange }: {
  opciones: Opciones
  filtros: Filtros
  onChange: (f: Filtros) => void
}) {
  const activos = filtros.canal.length + filtros.embudo.length + filtros.ciudad.length
    + filtros.vendedor.length + (filtros.desde ? 1 : 0) + (filtros.hasta ? 1 : 0)

  const alternarCanal = (c: string) => {
    const canal = filtros.canal.includes(c)
      ? filtros.canal.filter((x) => x !== c)
      : [...filtros.canal, c]
    onChange({ ...filtros, canal })
  }

  return (
    <div className="filtros">
      <div className="fila">
        <label>Canal</label>
        {opciones.canal.map((c) => (
          <button key={c} type="button" className="chip"
                  aria-pressed={filtros.canal.includes(c)}
                  onClick={() => alternarCanal(c)}>
            {canalLabel(c)}
          </button>
        ))}

        <div className="separador" />
        <Select rotulo="Embudo" valores={opciones.embudo} valor={filtros.embudo[0] ?? null}
                onChange={(v) => onChange({ ...filtros, embudo: v ? [v] : [] })} />
        <Select rotulo="Ciudad" valores={opciones.ciudad} valor={filtros.ciudad[0] ?? null}
                onChange={(v) => onChange({ ...filtros, ciudad: v ? [v] : [] })} />
        <Select rotulo="Vendedor" valores={opciones.vendedor} valor={filtros.vendedor[0] ?? null}
                onChange={(v) => onChange({ ...filtros, vendedor: v ? [v] : [] })} />

        <div className="separador" />
        <Select rotulo="Desde el mes" valores={opciones.mes} valor={filtros.desde}
                onChange={(v) => onChange({
                  ...filtros,
                  desde: v,
                  hasta: v && filtros.hasta && v > filtros.hasta ? v : filtros.hasta,
                })} formato={mesLargo} />
        <Select rotulo="Hasta el mes" valores={opciones.mes} valor={filtros.hasta}
                onChange={(v) => onChange({
                  ...filtros,
                  desde: v && filtros.desde && v < filtros.desde ? v : filtros.desde,
                  hasta: v,
                })} formato={mesLargo} />

        {activos > 0 && (
          <button type="button" className="chip limpiar" style={{ marginLeft: 'auto' }}
                  onClick={() => onChange(FILTROS_VACIOS)}>
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
