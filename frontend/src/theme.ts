/*
 * Parámetros visuales de los gráficos.
 *
 * Los colores de interfaz salen de DESIGN.md (el lenguaje ya adoptado en el
 * repo). Los de SERIE son aparte y están validados para daltonismo: el azul de
 * acento de la interfaz no puede hacer también de color de dato sin volver
 * ambiguo qué es un control y qué es una medición.
 */

/** Un canal siempre lleva su color, cambie o no la selección: el color sigue a
 *  la entidad, nunca a su posición en el ranking. */
export const COLOR_CANAL: Record<string, string> = {
  ad: 'var(--serie-1)',
  outbound: 'var(--serie-2)',
  form: 'var(--serie-3)',
  organico: 'var(--serie-4)',
}

export const NOMBRE_CANAL: Record<string, string> = {
  ad: 'Meta Ads',
  outbound: 'Outbound',
  form: 'Formulario',
  organico: 'Orgánico',
}

export const canalLabel = (c: string): string => NOMBRE_CANAL[c] ?? c
export const canalColor = (c: string): string => COLOR_CANAL[c] ?? 'var(--serie-1)'

/** Rampa ordinal azul para antigüedad: claro = fresco, oscuro = rancio.
 *  Arranca en el paso 250, el más claro que aún despega del blanco. */
export const COLOR_EDAD = ['var(--edad-1)', 'var(--edad-2)', 'var(--edad-3)', 'var(--edad-4)']
export const ETIQUETA_EDAD = ['0-7 días', '8-30 días', '31-90 días', '+90 días']
