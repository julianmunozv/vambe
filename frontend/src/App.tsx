/*
 * El armazón del panel: carga los datos una vez, mantiene un solo juego de
 * filtros y muestra el segmento activo.
 *
 * Los filtros viven ACÁ y no dentro de cada segmento: si cada pantalla filtrara
 * por su cuenta, dos podrían estar mirando poblaciones distintas y nadie tendría
 * cómo notarlo. Cambiar de segmento conserva el filtro, que es lo que permite
 * seguir un hilo — filtrar por Meta Ads en Canales y pasar a Embudo con el
 * filtro puesto.
 *
 * El contenido de cada segmento está en src/paginas/. Este archivo no dibuja
 * ninguna métrica.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dashboard, Filtros } from './types'
import { FILTROS_VACIOS } from './types'
import { inicializar } from './data/source'
import type { Fuente, Opciones } from './data/source'
import { SEGMENTOS, leerHash } from './segmentos'
import { ProveedorTooltip } from './components/Tooltip'
import { fechaCorta, mesLargo } from './format'
import { Sidebar } from './components/Sidebar'
import { FilterBar } from './components/FilterBar'
import { PaginaResumen } from './paginas/Resumen'
import { PaginaCanales } from './paginas/Canales'
import { PaginaEmbudo } from './paginas/Embudo'
import { PaginaEquipo } from './paginas/Equipo'

const PAGINAS: Record<string, (p: { d: Dashboard; onIr: (id: string) => void }) => JSX.Element> = {
  resumen: ({ d, onIr }) => <PaginaResumen d={d} onIr={onIr} />,
  canales: ({ d }) => <PaginaCanales d={d} />,
  embudo: ({ d }) => <PaginaEmbudo d={d} />,
  equipo: ({ d }) => <PaginaEquipo d={d} />,
}

export default function App() {
  const [fuente, setFuente] = useState<Fuente | null>(null)
  const [opciones, setOpciones] = useState<Opciones | null>(null)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS)
  const [datos, setDatos] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [segmento, setSegmento] = useState<string>(leerHash)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const { fuente: f, opciones: ops } = await inicializar()
        if (!vivo) return
        setFuente(f)
        setOpciones(ops)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
      }
    })()
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!fuente) return
    let vivo = true
    setCargando(true)
    fuente.cargar(filtros)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : 'Error al consultar') })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [fuente, filtros])

  // El botón «atrás» del navegador tiene que funcionar: el segmento vive en el
  // hash y el estado solo lo sigue.
  useEffect(() => {
    const sincronizar = () => setSegmento(leerHash())
    window.addEventListener('hashchange', sincronizar)
    return () => window.removeEventListener('hashchange', sincronizar)
  }, [])

  const ir = useCallback((id: string) => {
    window.location.hash = `#/${id}`
    setSegmento(id)
    window.scrollTo({ top: 0 })
  }, [])

  const cambiar = useCallback((f: Filtros) => setFiltros(f), [])
  const actual = useMemo(() => SEGMENTOS.find((s) => s.id === segmento) ?? SEGMENTOS[0]!, [segmento])

  if (error && !datos) return <div className="aviso">No se pudieron cargar los datos: {error}</div>
  if (!datos || !opciones || !fuente) return <div className="aviso">Cargando el panel…</div>

  const Pagina = PAGINAS[actual.id] ?? PAGINAS.resumen!
  return (
    <ProveedorTooltip>
      <div className="capa">
        <Sidebar activo={actual.id} onIr={ir} />

        <div className="area">
          {/* Un solo bloque pegajoso: dos `position: sticky` encadenados obligan
              a que el de abajo sepa el alto del de arriba, y ese número se
              desincroniza en cuanto cambia la cabecera. */}
          <div className="tope">
            <header className="cabecera">
              <div className="titulo">
                <h1>{actual.rotulo}</h1>
                <p>{actual.pregunta}</p>
              </div>
              <span className="contexto-fecha">
                {mesLargo(datos.contexto.inicio.slice(0, 7))}–{mesLargo(datos.contexto.corte.slice(0, 7))}
                {' · '}actualizado {fechaCorta(datos.contexto.corte)}
              </span>
              {filtrosActivos(filtros) && (
                <span className="marca-filtro">Vista filtrada · {datos.resumen.leads.toLocaleString('es-CL')} leads</span>
              )}
            </header>

            <FilterBar opciones={opciones} filtros={filtros} onChange={cambiar} />
          </div>

          <main data-cargando={cargando ? 'si' : 'no'}>
            <Pagina d={datos} onIr={ir} />
          </main>
        </div>
      </div>
    </ProveedorTooltip>
  )
}

const filtrosActivos = (f: Filtros): boolean =>
  f.canal.length > 0 || f.embudo.length > 0 || f.ciudad.length > 0
  || f.tipo_vehiculo.length > 0 || f.vendedor.length > 0 || f.desde !== null || f.hasta !== null
