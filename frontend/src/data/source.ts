/*
 * La fuente de datos del panel: el API.
 *
 * Los KPIs se calculan en SQL contra Postgres y el navegador solo pinta lo que
 * le devuelve `/api/todo`. Un cambio de filtro es un pedido; no hay copia de
 * los datos del lado del cliente.
 *
 * Hubo un segundo modo —un snapshot estático con las filas de fct_leads, para
 * publicar el panel sin servidor— y se sacó a propósito: mandaba 34.600 filas a
 * nivel de lead al navegador, y su fallback silencioso hacía que un API caído o
 * mal configurado se viera igual que uno sano. Si el API no responde, el panel
 * ahora falla a la vista.
 *
 * La implementación en TypeScript de los mismos KPIs sigue viva en src/kpis/,
 * pero ya no alimenta al panel: es el segundo par de ojos de `npm run verify`,
 * que compara sus números contra los del API caso por caso.
 */
import type { Dashboard, Filtros } from '../types'

export interface Fuente {
  cargar(f: Filtros): Promise<Dashboard>
}

/** Valores disponibles para los filtros. Salen de los datos, nunca de una lista fija. */
export interface Opciones {
  canal: string[]
  embudo: string[]
  ciudad: string[]
  vendedor: string[]
  mes: string[]
}

interface ContextoApi {
  opciones: {
    canal: string[]; embudo: string[]; ciudad: string[]; mes: string[]
    vendedores: { vendedor_id: number; nombre: string }[]
  }
}

function query(f: Filtros, idsVendedor: number[]): string {
  const p = new URLSearchParams()
  const listas: [string, string[]][] = [
    ['canal', f.canal], ['embudo', f.embudo], ['ciudad', f.ciudad],
    ['tipo_vehiculo', f.tipo_vehiculo],
  ]
  for (const [k, vs] of listas) vs.forEach((v) => p.append(k, v))
  idsVendedor.forEach((i) => p.append('vendedor_id', String(i)))
  if (f.desde) p.set('desde', f.desde)
  if (f.hasta) p.set('hasta', f.hasta)
  return p.toString()
}

/**
 * El API filtra vendedores por id y el panel los maneja por nombre (es lo que el
 * usuario elige). El mapa se arma UNA vez al arrancar: resolverlo en cada carga
 * costaba un round-trip extra por cada cambio de filtro.
 */
function fuenteApi(nombreAId: Map<string, number>): Fuente {
  return {
    async cargar(f) {
      const ids = f.vendedor.map((n) => nombreAId.get(n)).filter((i): i is number => i !== undefined)
      const qs = query(f, ids)
      const r = await fetch(`/api/todo${qs ? `?${qs}` : ''}`)
      if (!r.ok) throw new Error(`el API respondió ${r.status}`)
      return (await r.json()) as Dashboard
    },
  }
}

const ordenar = (xs: string[]): string[] => [...xs].sort()

/**
 * Arranca el panel: resuelve el dataset por defecto y las opciones de filtro en
 * un solo pedido. Después, cada cambio de filtro es un solo `/api/todo`.
 *
 * Si el API no está, esto lanza. Es deliberado — antes se caía a un snapshot y
 * el panel seguía andando con datos de otra procedencia sin decirlo.
 */
export async function inicializar(): Promise<{ fuente: Fuente; opciones: Opciones }> {
  let r: Response
  try {
    r = await fetch('/api/contexto', { signal: AbortSignal.timeout(8000) })
  } catch (e) {
    throw new Error(
      `no se pudo contactar al API (${e instanceof Error ? e.message : 'error de red'}). ` +
      'Verificá que el backend esté corriendo y que DATABASE_URL apunte a la base.',
    )
  }
  if (!r.ok) {
    // 503 es el caso esperable: el API vive pero todavía no hay un dataset
    // procesado por el ETL. Merece un mensaje propio, no un código suelto.
    const detalle = r.status === 503
      ? 'el API está arriba pero no hay ningún dataset procesado todavía; corré el ETL'
      : `el API respondió ${r.status}`
    throw new Error(detalle)
  }

  const ctx = (await r.json()) as ContextoApi
  const vend = ctx.opciones.vendedores
  return {
    fuente: fuenteApi(new Map(vend.map((v) => [v.nombre, v.vendedor_id]))),
    opciones: {
      canal: ctx.opciones.canal, embudo: ctx.opciones.embudo, ciudad: ctx.opciones.ciudad,
      vendedor: ordenar(vend.map((v) => v.nombre)), mes: ctx.opciones.mes,
    },
  }
}
