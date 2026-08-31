/*
 * Una cifra rotulada, con su definición a mano.
 *
 * El rótulo y la definición NO se escriben acá: salen de kpis/catalogo.ts. En un
 * panel el nombre de una métrica es parte de su definición — «conversión» puede
 * significar cuatro cosas y quien la lee no tiene cómo saber cuál está viendo —
 * así que apuntar el rótulo muestra qué mide y el punteado lo anuncia.
 *
 * El globo dice QUÉ MIDE, nunca dónde está el código. En qué archivo se calcula
 * es dato de auditoría y vive en el diccionario de Metodología, que es la única
 * pantalla escrita para quien revisa los números y no para quien los usa.
 */
import type { ClaveMetrica } from '../kpis/catalogo'
import { met } from '../kpis/catalogo'
import { useTooltip } from './Tooltip'

export function Rotulo({ id, texto }: { id: ClaveMetrica; texto?: string }) {
  const m = met(id)
  const tip = useTooltip({ titulo: m.nombre, texto: m.definicion, filas: [] })
  // el spread trae className="marca" del tooltip: se compone, no se pisa
  return <span {...tip} className={`definible ${tip.className}`} tabIndex={0}>{texto ?? m.nombre}</span>
}

export function Cifra({ id, valor, nota, tam = 'm', estado }: {
  id: ClaveMetrica
  valor: string
  nota?: string
  tam?: 's' | 'm' | 'l'
  estado?: 'malo' | 'alerta'
}) {
  return (
    <div className="cifra-bloque" data-tam={tam}>
      <div className="rotulo">
        {estado && <i className="punto" style={{ background: `var(--${estado})` }} />}
        <Rotulo id={id} />
      </div>
      <div className="valor num">{valor}</div>
      {nota && <div className="nota num">{nota}</div>}
    </div>
  )
}
