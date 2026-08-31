/*
 * Globo de detalle compartido por todos los gráficos.
 *
 * Uno solo para toda la página, movido por el puntero: montar y desmontar un
 * nodo por marca haría parpadear el layout con cientos de marcas en pantalla.
 * Se ancla al grupo SVG completo, así el área sensible es la marca entera y no
 * el pixel del trazo.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

export interface Detalle {
  titulo: string
  filas: [string, string][]
  /** Definición de la métrica. Va cuando lo que falta no es el dato sino qué mide. */
  texto?: string
  nota?: string
}

interface ApiTooltip {
  mostrar: (d: Detalle, e: ReactMouseEvent) => void
  mostrarEn: (d: Detalle, el: Element) => void
  mover: (e: ReactMouseEvent) => void
  ocultar: () => void
}

const Ctx = createContext<ApiTooltip | null>(null)

export function ProveedorTooltip({ children }: { children: ReactNode }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const globo = useRef<HTMLDivElement>(null)

  const posicionar = useCallback((e: ReactMouseEvent) => {
    const g = globo.current
    if (!g) return
    const r = g.getBoundingClientRect()
    // Se voltea contra el borde para no salirse de la ventana
    const x = e.clientX + 14 + r.width > window.innerWidth - 8 ? e.clientX - r.width - 14 : e.clientX + 14
    const y = e.clientY + 14 + r.height > window.innerHeight - 8 ? e.clientY - r.height - 14 : e.clientY + 14
    g.style.transform = `translate(${x}px, ${y}px)`
  }, [])

  const posicionarEn = useCallback((el: Element) => {
    const g = globo.current
    if (!g) return
    const a = el.getBoundingClientRect()
    const r = g.getBoundingClientRect()
    const centro = a.left + a.width / 2
    const x = Math.min(Math.max(8, centro - r.width / 2), window.innerWidth - r.width - 8)
    const y = a.bottom + 10 + r.height <= window.innerHeight - 8
      ? a.bottom + 10
      : Math.max(8, a.top - r.height - 10)
    g.style.transform = `translate(${x}px, ${y}px)`
  }, [])

  const api = useMemo<ApiTooltip>(() => ({
    mostrar: (d, e) => { setDetalle(d); posicionar(e) },
    mostrarEn: (d, el) => { setDetalle(d); requestAnimationFrame(() => posicionarEn(el)) },
    mover: posicionar,
    ocultar: () => setDetalle(null),
  }), [posicionar, posicionarEn])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div ref={globo} className="globo" data-visible={detalle ? 'si' : 'no'} role="status" aria-live="polite">
        {detalle && (
          <>
            <strong>{detalle.titulo}</strong>
            {detalle.texto && <p className="texto">{detalle.texto}</p>}
            {detalle.filas.map(([k, v]) => (
              <div className="fila" key={k}><span>{k}</span><b>{v}</b></div>
            ))}
            {detalle.nota && <div className="nota">{detalle.nota}</div>}
          </>
        )}
      </div>
    </Ctx.Provider>
  )
}

/** Handlers para colgar de un <g> del gráfico. */
export function useTooltip(detalle: Detalle) {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTooltip fuera de ProveedorTooltip')
  return {
    className: 'marca',
    tabIndex: 0,
    onMouseEnter: (e: ReactMouseEvent) => ctx.mostrar(detalle, e),
    onMouseMove: ctx.mover,
    onMouseLeave: ctx.ocultar,
    onFocus: (e: ReactFocusEvent<Element>) => ctx.mostrarEn(detalle, e.currentTarget),
    onBlur: ctx.ocultar,
  }
}
