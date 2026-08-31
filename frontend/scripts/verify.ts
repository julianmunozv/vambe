/*
 * Comprueba que las dos implementaciones de los KPIs dan los MISMOS números.
 *
 * Son dos: SQL en backend/api/kpis/ (la que sirve al panel) y TypeScript en
 * src/kpis/ (que ya no alimenta nada — existe justamente para esto). Que
 * coincidan no puede ser un acto de fe: esto las corre sobre los mismos filtros
 * y falla si alguna cifra se separa.
 *
 * El TS lee las filas desde backend/snapshot/snapshot.json, que NO se publica
 * con el panel: se regenera con `python backend/snapshot/build.py`.
 *
 *   npm run verify                       # contra http://127.0.0.1:8077
 *   npm run verify -- http://otro:8000
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { agregar, campanas, herramientas, seleccionar } from '../src/kpis'
import { FILTROS_VACIOS } from '../src/types'
import type { Dashboard, Filtros, Snapshot } from '../src/types'

const AQUI = dirname(fileURLToPath(import.meta.url))
const BASE = process.argv[2] ?? 'http://127.0.0.1:8077'

const f = (p: Partial<Filtros>): Filtros => ({ ...FILTROS_VACIOS, ...p })

/* Casos elegidos para tocar cada rama del filtrado: sin filtro, un valor, varios
   valores, cruce de dimensiones y rango de meses. */
const CASOS: { nombre: string; filtros: Filtros }[] = [
  { nombre: 'sin filtros', filtros: f({}) },
  { nombre: 'canal=ad', filtros: f({ canal: ['ad'] }) },
  { nombre: 'canal=organico+form', filtros: f({ canal: ['organico', 'form'] }) },
  { nombre: 'embudo=usados', filtros: f({ embudo: ['Ventas Autos Usados'] }) },
  { nombre: 'ad x nuevos', filtros: f({ canal: ['ad'], embudo: ['Ventas Autos Nuevos'] }) },
  { nombre: 'ciudad=Santiago', filtros: f({ ciudad: ['Santiago'] }) },
  { nombre: 'rango 2025-09..2025-12', filtros: f({ desde: '2025-09', hasta: '2025-12' }) },
  { nombre: 'organico x Santiago x nuevos',
    filtros: f({ canal: ['organico'], ciudad: ['Santiago'], embudo: ['Ventas Autos Nuevos'] }) },
]

function query(x: Filtros): string {
  const p = new URLSearchParams()
  for (const k of ['canal', 'embudo', 'ciudad', 'tipo_vehiculo'] as const) {
    x[k].forEach((v) => p.append(k, v))
  }
  if (x.desde) p.set('desde', x.desde)
  if (x.hasta) p.set('hasta', x.hasta)
  return p.toString()
}

/* Las dos partes redondean tasas a 2 decimales; se comparan a 1, que es lo que
   el panel muestra. Exigir más sería comparar precisión que nadie ve. */
const num = (x: unknown): number | null =>
  x === null || x === undefined ? null : Math.round(Number(x) * 10) / 10

function comparar(ruta: string, a: unknown, b: unknown, difs: string[]): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { difs.push(`${ruta}: largo ${a.length} vs ${b.length}`); return }
    a.forEach((_, i) => comparar(`${ruta}[${i}]`, a[i], b[i], difs))
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(b as object)) {
      if (k in (a as object)) {
        comparar(`${ruta}.${k}`, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], difs)
      }
    }
  } else if (typeof b === 'number' || typeof a === 'number') {
    if (num(a) !== num(b)) difs.push(`${ruta}: ts=${num(a)} api=${num(b)}`)
  } else if (typeof b === 'boolean') {
    if (a !== b) difs.push(`${ruta}: ts=${String(a)} api=${String(b)}`)
  } else if (String(a) !== String(b)) {
    difs.push(`${ruta}: ts="${String(a)}" api="${String(b)}"`)
  }
}

/* El API ordena por su propio criterio; las secciones se alinean por su clave
   natural antes de comparar, no por posición. Una sección de grano compuesto
   —canales_mes es mes × canal— declara sus campos separados por '|': la clave
   natural es la combinación, y alinear por uno solo cruzaría filas distintas. */
const CLAVE: Record<string, string> = {
  ventas_mes: 'mes',
  canales: 'canal', canales_mes: 'mes|canal', origenes: 'origen',
  embudo: 'etapa', estancados: 'etapa',
  cohortes: 'mes', handoff: 'tramo', vendedores: 'nombre',
}

/* Las secciones que quedaron fuera del panel siguen teniendo dos
   implementaciones, así que se siguen comparando — pero no viajan en /api/todo:
   cada una se pide a su endpoint suelto. */
const SUELTAS: { seccion: string; ruta: string; clave: string;
                 ts: (S: Snapshot, sel: number[]) => unknown[] }[] = [
  { seccion: 'campanas', ruta: 'campanas', clave: 'campana', ts: campanas },
  { seccion: 'herramientas', ruta: 'herramientas', clave: 'herramienta', ts: herramientas },
]

function alinear(clave: string | undefined, ts: unknown[], api: unknown[]): [unknown[], unknown[]] {
  if (!clave) return [ts, api]
  const campos = clave.split('|')
  const id = (r: unknown): string =>
    campos.map((c) => String((r as Record<string, unknown>)[c])).join('|')
  const porClave = new Map(ts.map((r) => [id(r), r]))
  return [api.map((r) => porClave.get(id(r)) ?? {}), api]
}

const S = JSON.parse(
  await readFile(join(AQUI, '..', '..', 'backend', 'snapshot', 'snapshot.json'), 'utf8'),
) as Snapshot

let fallas = 0
for (const caso of CASOS) {
  const r = await fetch(`${BASE}/api/todo?${query(caso.filtros)}`)
  if (!r.ok) { console.error(`  ✗ ${caso.nombre}: el API respondió ${r.status}`); fallas++; continue }
  const api = (await r.json()) as Dashboard & Record<string, unknown>
  const ts = agregar(S, caso.filtros) as Dashboard & Record<string, unknown>

  const difs: string[] = []
  comparar('resumen', ts.resumen, api.resumen, difs)
  for (const [seccion, clave] of Object.entries(CLAVE)) {
    const [a, b] = alinear(clave, (ts[seccion] ?? []) as unknown[], (api[seccion] ?? []) as unknown[])
    comparar(seccion, a, b, difs)
  }

  const sel = seleccionar(S, caso.filtros)
  for (const x of SUELTAS) {
    const rs = await fetch(`${BASE}/api/${x.ruta}?${query(caso.filtros)}`)
    if (!rs.ok) { difs.push(`${x.seccion}: el API respondió ${rs.status}`); continue }
    const [a, b] = alinear(x.clave, x.ts(S, sel), (await rs.json()) as unknown[])
    comparar(x.seccion, a, b, difs)
  }

  if (difs.length) {
    fallas++
    console.log(`  ✗ ${caso.nombre}  (${difs.length} diferencias)`)
    difs.slice(0, 12).forEach((d) => console.log(`      ${d}`))
  } else {
    console.log(`  ✓ ${caso.nombre}  ·  ${ts.resumen.leads.toLocaleString('es-CL')} leads`)
  }
}

console.log(fallas
  ? `\n  ${fallas} caso(s) con diferencias\n`
  : '\n  las dos implementaciones coinciden en todos los casos\n')
process.exit(fallas ? 1 : 0)
