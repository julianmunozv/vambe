/*
 * EL ÍNDICE DE KPIs DEL PANEL. Si buscás dónde se calcula un número, empezá acá.
 *
 * Cada sección del `Dashboard` sale de una función, y cada familia vive en su
 * propio archivo — con el MISMO nombre que su gemelo en SQL:
 *
 *     resumen       kpis/resumen.ts    ←→  backend/api/kpis/resumen.py
 *     ventas_mes    kpis/ventas.ts     ←→  backend/api/kpis/ventas.py
 *     canales       kpis/canales.ts    ←→  backend/api/kpis/canales.py
 *     canales_mes   kpis/canales.ts    ←→  backend/api/kpis/canales.py
 *     origenes      kpis/canales.ts    ←→  backend/api/kpis/canales.py
 *     embudo        kpis/embudo.ts     ←→  backend/api/kpis/embudo.py
 *     estancados    kpis/embudo.ts     ←→  backend/api/kpis/embudo.py
 *     cohortes      kpis/cohortes.ts   ←→  backend/api/kpis/cohortes.py
 *     handoff       kpis/ia.ts         ←→  backend/api/kpis/ia.py
 *     vendedores    kpis/equipo.ts     ←→  backend/api/kpis/equipo.py
 *
 * Son DOS implementaciones del mismo contrato (`Dashboard`): el API calcula en
 * SQL —y es la única que alimenta el panel— y esto calcula lo mismo sobre las
 * filas crudas. Nada de este archivo llega al navegador: existe para que
 * `npm run verify` compare las dos número por número sobre ocho combinaciones
 * de filtros, y tocar una sin la otra lo detecte.
 *
 * `campanas` y `herramientas` quedan fuera del panel y de esta lista. A
 * `campanas` la contiene `origenes`, con el nombre de la campaña en vez del id
 * de Meta; `herramientas` salió de Equipo porque la falla por tool es un bug de
 * integración, no una decisión de negocio. Las dos siguen vivas como endpoint
 * suelto del API con su gemelo acá, pero no entran en `agregar` — `verify` las
 * compara contra su propio endpoint (ver SUELTAS en scripts/verify.ts).
 *
 * Además de estas secciones hay tres módulos que NO son KPIs y no cruzan
 * al backend, porque no deciden nada de negocio — solo releen lo ya calculado.
 * Son los únicos de esta carpeta que SÍ se usan en pantalla:
 *
 *     panorama.ts   la lectura de una pasada para gerencia
 *     hallazgos.ts  las tres tarjetas de conclusión
 *     catalogo.ts   cómo se llama y qué significa cada métrica en pantalla
 */
import type { Dashboard, Filtros, Snapshot } from '../types'
import { seleccionar } from './base'
import { campanas, canales, canalesMes, origenes } from './canales'
import { cohortes } from './cohortes'
import { embudo, estancados } from './embudo'
import { vendedores } from './equipo'
import { handoff, herramientas } from './ia'
import { resumen } from './resumen'
import { ventasMes } from './ventas'

export { campanas, canales, canalesMes, cohortes, embudo, estancados, handoff, herramientas,
  origenes, resumen, vendedores, ventasMes }
export { percentil, seleccionar } from './base'

/** El panel completo sobre una sola población filtrada. */
export function agregar(S: Snapshot, f: Filtros): Dashboard {
  const sel = seleccionar(S, f)
  return {
    contexto: S.contexto,
    resumen: resumen(S, sel),
    ventas_mes: ventasMes(S, sel),
    canales: canales(S, sel),
    canales_mes: canalesMes(S, sel),
    origenes: origenes(S, sel),
    embudo: embudo(S, sel),
    estancados: estancados(S, sel),
    cohortes: cohortes(S, sel),
    handoff: handoff(S, sel),
    vendedores: vendedores(S, sel),
  }
}
