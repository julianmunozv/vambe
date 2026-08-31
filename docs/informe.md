# Vambe Motors · Qué medir y qué hacer

Prueba técnica Solutions Architect · export de 12 meses (1 jun 2025 – 15 jun 2026),
34.600 leads, 1,17 M de filas de origen.

---

## 1 · Qué KPIs elegí y por qué

El criterio para incluir una métrica fue uno solo: **¿cambia una decisión?** Una
concesionario que opera así toma cuatro decisiones recurrentes, y cada bloque del
panel existe para una de ellas.

| Decisión | KPI | Por qué ese y no otro |
|---|---|---|
| **Dónde poner el presupuesto** | Conversión a venta y **participación en ventas vs. participación en leads**, por canal y campaña | El costo por lead premia al canal que trae volumen barato. Lo que importa es cuántas *ventas* aporta cada peso, y para eso hay que ver las dos participaciones juntas. |
| **Dónde se atasca la operación** | Embudo por etapa **alcanzada**, mediana de días por etapa, y cartera abierta por antigüedad | La foto de "etapa actual" miente: Negociación es de paso y hoy tiene cero ocupantes, aunque pasaron 3.775 leads. Y sin la antigüedad no se distingue un pipeline sano de uno lleno de leads muertos. |
| **Si la IA está aportando** | Tasa de transferencia y **tramo hasta la primera respuesta humana** | La pregunta útil no es "¿la IA convierte?" sino "¿dónde se rompe el traspaso?". La tasa de falla por herramienta la dejé fuera del panel: es un bug con dueño en producto, se arregla una vez y nadie en comercial decide distinto según lo que diga. Va acá, en §2.5, y sigue disponible en `/api/herramientas`. |
| **A quién entrenar o premiar** | Conversión del vendedor **dentro del canal pagado**, con su mezcla de leads al lado | La conversión cruda de un vendedor mide sobre todo qué leads le asignaron. Publicarla sola hace premiar el ruteo. |

**Qué dejé fuera a propósito.** El no-show es prácticamente idéntico entre
sucursales y tipos de cita (25,1% a 25,9%): no hay una sucursal con un problema,
y graficarlo invitaría a inventar uno. El `score` del asistente no correlaciona con
su propia bandera de calificado, y el `lifecyclestage` del CRM se reparte 20%
uniforme sin relación con la etapa real. Son ruido con forma de métrica. Están
medidos y reportados en el perfilado, pero no en el panel.

---

## 2 · Qué encontré

### 2.1 · Meta Ads compra volumen, no ventas

| Canal | % de los leads | % de las ventas | Conversión |
|---|---|---|---|
| Meta Ads | **44,6%** | **20,2%** | 4,5% |
| Outbound | 23,5% | 27,0% | 11,4% |
| Formulario | 18,3% | 18,7% | 10,1% |
| Orgánico | **13,6%** | **34,0%** | **24,7%** |

Casi la mitad del volumen produce una quinta parte de las ventas. El orgánico hace
lo inverso. No es un efecto de mezcla: se sostiene igual dentro de cada embudo
(nuevos 4,3% vs 25,0%; usados 4,8% vs 24,3%), así que no es que los ads traigan
gente que compra usados.

Dentro de lo pagado, la diferencia también es clara: **retargeting convierte 7,5%
y lookalike 3,8%** — y lookalike es justamente la campaña con más volumen (7.716
leads, la mitad de todo el pagado).

> **Recomendación.** Mover presupuesto de `meta_lookalike_compradores` a
> retargeting y a lo que alimenta el canal orgánico. Antes de escalar cualquier
> campaña, exigir el costo: hoy no está en los datos y sin él "el canal barato"
> es una afirmación sin respaldo.

### 2.2 · 2.233 leads escalados que nadie contestó

De los 15.567 leads que la IA transfirió a un vendedor, **2.233 (14%) nunca
recibieron un mensaje humano**. Convierten al **3,1%**, contra **11,1%** de los que
sí recibieron respuesta.

Lo no obvio es lo que pasa entre los que *sí* la reciben: contestar en menos de una
hora (11,5%) y contestar después de un día (11,3%) dan prácticamente lo mismo.
**Lo que decide no es la velocidad de la respuesta: es que exista.** Un SLA de
minutos sería optimizar la variable equivocada.

> **Recomendación.** Una alerta cuando una transferencia lleva 24 h sin primer
> mensaje humano, y que el lead vuelva a la cola. Si esos 2.233 convirtieran a la
> tasa de los atendidos, son **~176 ventas adicionales** sin comprar un lead más
> ni contratar a nadie. Es el arreglo más barato del tablero.

### 2.3 · El 61% de la cartera abierta está muerta

De 14.361 leads abiertos, **8.738 llevan más de 90 días sin cambiar de etapa**; el
más antiguo lleva 379 días. La mayor concentración está en "Contactado" (2.861) y
en "Nuevo Lead" (2.659) — leads que entraron y nunca se trabajaron.

No es solo trabajo perdido: infla el pronóstico y esconde los leads vivos entre
miles de muertos.

> **Recomendación.** Cierre automático por inactividad a los 90 días, con una
> campaña de reactivación antes. Sin eso, cualquier métrica de pipeline que
> reporte la gerencia está inflada.

### 2.4 · El mejor vendedor no es el mejor vendedor

Patricia Vega convierte **20,7%** y Cristián Reyes **4,2%** — una diferencia de casi
5x que invitaría a premiar a una y capacitar al otro.

Pero Patricia recibe **33,8% de leads orgánicos** y el resto del equipo entre 7% y
17%. **Dentro del canal pagado, donde todos reciben el mismo tipo de lead, el
equipo entero está entre 3,0% y 5,7%** — y Patricia queda en 5,2%, en medio del
pelotón.

> **Recomendación.** El ranking crudo mide la asignación de leads, no el
> desempeño. Evaluar dentro de canal, y revisar por qué la distribución de leads
> orgánicos está tan concentrada en una persona.

### 2.5 · Dos hallazgos menores con dueño claro

- `consultar_financiamiento` **falla el 10,1%** de las veces (1.733 llamadas fallidas) y
  `consultar_inventario` el 5,0%. Son las dos únicas herramientas que fallan. Es un
  bug de integración, no un tema comercial: por eso se reporta acá y no ocupa una
  tarjeta del panel.
- Los leads que agendan test drive convierten **12,5%** contra **7,9%** de los que
  no. Lo reporto como correlación y no como palanca: agendar un test drive *es*
  avanzar en el embudo, así que el número no prueba que forzar más test drives
  suba las ventas.

---

## 3 · Supuestos y límites

**Supuestos que cambian los números si se discuten:**

- **Atribución first-touch.** 1.761 leads (5,1%) tienen más de un payload de origen
  y el 98,2% se contradicen entre sí. Me quedo con el primer contacto porque mide
  *adquisición*, que es la pregunta de presupuesto; last-touch mediría *cierre*.
  Los toques completos quedan guardados en `fct_touchpoints`, así que la decisión
  es reversible sin recargar nada.
- **"Ganado" se identifica por nombre, no por orden.** Hay dos etapas terminales y
  el esquema no distingue cuál es el éxito. Asumir "la terminal de menor orden
  gana" rompería con un embudo diseñado al revés.
- **La conversión se calcula sobre todos los leads, no solo los cerrados.** Un lead
  abandonado que nunca se marcó "Perdido" es una venta que no ocurrió. Medir solo
  sobre cerrados premia no cerrar.
- **Los meses se comparan a la misma edad: una ventana de 30 días.** Cada mes de
  entrada se mide por las ventas ocurridas dentro de los primeros 30 días de sus
  leads, y entra al gráfico cuando su último lead ya cumplió ese plazo. Comparar el
  resultado *acumulado* de meses de distinta antigüedad no compara conversión,
  compara tiempo transcurrido: con el corte del export, junio 2025 tuvo 350 días
  para convertir y abril 2026 tuvo 46 (y junio 2026, cero — 99,5% de sus leads
  siguen abiertos y su tasa aparente es 0,2%). Es censura por la derecha, y la
  corrección es la estándar de *vintage analysis*: misma ventana para todos.
  La ventana está declarada en `config.yml → cohortes.ventana_dias`, no derivada:
  30 días deja 12 de los 13 meses comparables y mide la primera parte de cada uno
  —tres de cada cuatro ventas ocurren dentro de 93 días desde la entrada del lead,
  así que dentro de la ventana cae cerca de un tercio de ellas. Con 93 días
  quedarían 9 meses comparables.
- **Esa corrección cambia el diagnóstico, no solo el gráfico.** Sobre el acumulado
  la conversión parecía caer de 12,3% (agosto 2025) a 10,6% (abril 2026); medida a
  30 días viene subiendo de 3,0% a 5,1%. El único bache que sobrevive a la
  corrección es noviembre 2025 (2,4% a 30 días contra ~3,9% de sus vecinos), y es
  el mes en que el volumen llegó a 5.035 leads.
- **El 23,5% de los leads (outbound) no trae señal de origen entrante** y se
  recupera del `source` del CRM. Verifiqué que ese campo coincide 100% con el canal
  derivado en los casos donde ambos existen, y que es constante por contacto.

**Qué me faltó para profundizar:**

- **Costo por canal y campaña.** Es lo que más falta. Sin inversión publicitaria no
  hay CAC ni ROAS, y la recomendación de presupuesto de §2.1 se queda en "convierte
  peor" cuando debería ser "cuesta $X por venta contra $Y".
- **Monto de la venta.** Hay presupuesto declarado por el lead, pero no precio de
  cierre. Un canal que convierte menos pero vende más caro podría ser el mejor y
  hoy no se puede saber.
- **Capacidad del equipo.** No sé si los 2.233 leads sin respuesta son un problema
  de proceso o de dotación. Con horas trabajadas por vendedor la respuesta sería
  distinta.
- **Por qué los ads convierten mal.** Los datos dicen *que* pasa, no *por qué*.
  Faltaría el creativo y la landing para separar "mala audiencia" de "mala promesa".

---

## 4 · Cómo está construido

`SQLite → raw (copia fiel) → perfilado → stg → analytics → API → panel React`

Las decisiones de limpieza **no están escritas en el código**. El ruido lo detectan
tres reglas estadísticas sobre los datos crudos, y las vistas leen el reporte que
producen: valor dominante (>99% un solo valor), poder discriminante (eta² contra el
agrupador natural) y frecuencia de clave JSON (<1% de los documentos). Sobre esta
base encontraron 10 columnas constantes, 53 campos de relleno, 2 métricas sin
información y 900 claves JSON inyectadas. Ninguna está nombrada a mano: otra base
con ruido distinto se limpia igual.

El detalle de decisiones de diseño está en [`docs/decisiones.md`](decisiones.md).
