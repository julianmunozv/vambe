# Decisiones de diseño

Por qué el proyecto está armado así y no de otra forma. Cada decisión con la
alternativa que se descartó, para que sea discutible en vez de quedar enterrada.

---

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Almacén | **PostgreSQL** | El origen son 1,17 M de filas con JSON anidado. Postgres da `jsonb` con índices, `percentile_cont`, funciones de ventana y `TABLESAMPLE` — todo lo que necesita el perfilado. En SQLite el perfilado sería código Python recorriendo filas. |
| ETL | **Python + SQL, sin framework** | El pipeline tiene cuatro fases y corre entero en ~17 s. dbt o Airflow agregarían más configuración que la lógica que ordenan. La reproducibilidad la da un CLI con fases reanudables. |
| API | **FastAPI** | Tipado en los parámetros de query, OpenAPI gratis para auditar los endpoints, y el mismo proceso sirve el panel estático: en producción no hay CORS. |
| Panel | **React + TypeScript + Vite** | Once secciones que se repintan con cada cambio de filtro: el estado derivado es justo lo que React resuelve bien. TypeScript importa más de lo habitual acá porque el tipo `Dashboard` es el **contrato entre dos implementaciones** de los mismos KPIs — si el API cambia una forma, el compilador lo dice. |
| Gráficos | **SVG a mano, sin librería** | Cinco gráficos: barras, barras apiladas y una línea. Recharts o Chart.js serían ~150 KB para eso, y ninguno da de fábrica lo que estos gráficos necesitan (la zona apagada de los meses que aún no cumplen la ventana, la caída escrita entre barras del embudo). El bundle completo queda en 61 KB comprimido. |
| Publicación | **Un servicio: FastAPI sirve el build** | Hubo un modo estático con los datos embebidos y se eliminó: mandaba 34.600 filas a nivel de lead al navegador —peso y exposición— y su fallback silencioso hacía que un API caído se viera igual que uno sano. El panel pide los KPIs al API y falla a la vista si no está. El build quedó en 216 KB. |

---

## Las tres capas y por qué existen

**`raw` es una copia fiel.** Ni un filtro, ni una columna descartada — ni siquiera
las que ya sabemos que son basura. Filtrar acá hardcodearía justo lo que el diseño
evita y dejaría al perfilado sin nada que detectar. El esquema se introspecciona
de `sqlite_master`, así que el pipeline corre sobre cualquier base, no solo esta.
Un contrato de fidelidad compara los conteos y aborta si no calzan: si la ingesta
pierde filas en silencio, todo lo que viene después está mal y no habría forma de
notarlo.

**El perfilado detecta ruido sin nombrar columnas.** Tres reglas estadísticas, con
sus umbrales declarados en `etl/config.yml` junto a la medición que los justifica:

- **A · Valor dominante** (>99%). Medido: 8 campos de `registros_cambios` al 100,00%
  contra `etapa_id` al 19,4%.
- **B · Poder discriminante** (eta² < 0,01). Medido: `duracion_ms` = 0,000028 (ruido)
  contra presupuesto por tipo de vehículo = 0,42 (señal). El umbral queda con 350x
  de margen bajo la señal más débil real.
- **C · Frecuencia de clave JSON** (<1%). Medido: ~900 claves `x_meta_*` con máximo
  0,36% contra una señal mínima de 15,6%. 43x de separación.

La alternativa —una lista de columnas a ignorar— habría sido más corta de escribir
y habría fallado con el próximo export.

**`stg` limpia sin combinar; `analytics` combina.** Cada vista de staging lee una
tabla de hechos. Los cruces son trabajo de analytics. El SQL de staging se arma en
Python porque los literales salen del reporte de perfilado y del config, no de un
`.sql` tipeado a mano que nadie vuelve a mirar.

**Las fases son reanudables.** La ingesta de 1,17 M de filas tarda minutos y el
perfilado necesita las claves foráneas del origen; un corte a mitad de camino no
puede obligar a recargar todo. `--desde perfilado|modelado` retoma sobre un
dataset ya cargado, y rehacer todo el modelado son 17 segundos.

---

## Decisiones que afectan los números

**Un lead se cuenta solo desde `fct_leads`.** Es la regla dura del modelo. Contar
desde una tabla de grano más fino infla los totales: contar payloads en vez de
leads infla el canal orgánico un 20,3% y hunde su conversión de 24,7% a ~20,5%.

**Los contratos de unicidad son propiedades de *estos* datos, no del esquema.** El
DDL no impide que `citas` tenga dos filas por contacto; que hoy no las tenga es lo
que permite que el join no duplique. Están declarados en `config.yml` para que otra
base que los viole falle ruidosamente en vez de duplicar filas en silencio.

**Las estadías incluyen los intervalos abiertos.** `LAG()` sobre las transiciones
deja dos huecos: la primera etapa no tiene transición previa y la etapa actual sigue
abierta. Sin anclar la primera a `creado_en` y cerrar la última contra la fecha de
corte, no se ven ni los leads que nunca se trabajaron ni los estancados — el 42% de
la base.

**El orden de los eventos se desempata explícitamente.** 241 contactos tienen
dos transiciones registradas en el mismo timestamp. Ordenar la ventana solo por
`ocurrido_en` deja el desempate al criterio del planificador: el mismo dato daba
números distintos en cada reconstrucción, con leads que cambiaban de etapa actual
entre corridas. El desempate correcto lo da el propio dato — `etapa_desde`
encadena con `etapa_hasta`, así que el orden del embudo es el orden real — y
verificado con tres reconstrucciones seguidas que ahora dan lo mismo.

**El embudo mide etapas alcanzadas, no la etapa actual.** "Cuántos hay hoy en
Negociación" da 0 porque es una etapa de paso. La pregunta del negocio es cuántos
llegaron: 3.775.

**Los meses de entrada se comparan a la misma edad, no por su resultado final.**
El acumulado de un mes viejo y el de un mes nuevo no son la misma medida: el nuevo
todavía tiene ventas por llegar. La serie del panel cuenta, de cada mes, solo las
ventas ocurridas dentro de los primeros 30 días del lead
(`config.yml → cohortes.ventana_dias`), que es la corrección estándar de censura
por la derecha. Cambia el diagnóstico: sobre el acumulado la conversión parecía
caer de 12,3% a 10,6% entre ago 2025 y abr 2026, y a igual edad viene subiendo de
3,0% a 5,1%.

**La edad se mide contra el corte del dataset, no del filtro.** Si el usuario
filtra sep–dic 2025, esos meses siguen siendo comparables: ya pasó el tiempo real.
Medirlo contra el rango filtrado los volvería incomparables por mirarlos.

---

## Cómo se sabe que el panel publicado dice la verdad

Los KPIs están implementados dos veces: en SQL (`backend/api/kpis/`, la que sirve
al panel) y en TypeScript (`frontend/src/kpis/`). La segunda no alimenta nada:
existe para contrastar a la primera, y esa redundancia deliberada es el único
chequeo independiente que tienen los números. Que coincidan no es un acto de fe:

```
cd frontend && npm run verify
```

corre las dos sobre ocho combinaciones de filtros —sin filtro, un canal, varios
canales, cruces de dimensiones, rangos de meses— y compara número por número.
Falla si alguna cifra se separa.

Encontró tres bugs reales mientras se construía: un doble redondeo que corría las
tasas medio punto, días de etapa redondeados que movían leads de tramo de
antigüedad, y una definición de "días en la etapa actual" que sumaba visitas
anteriores a la misma etapa. Un cuarto apareció al comparar dos corridas del ETL
entre sí: el orden no determinista de las ventanas descrito más arriba.

La lógica de negocio vive una sola vez, en SQL. El TypeScript solo cuenta,
promedia y saca percentiles sobre banderas que ya vienen decididas — `es_ganado`,
`transferido`, el tramo de SLA, qué etapas alcanzó cada lead. Una regla de negocio
nueva va como columna derivada en `backend/snapshot/build.py`, nunca en
`frontend/src/kpis/`.

Los dos lados están organizados igual a propósito: `backend/api/kpis/canales.py` y
`frontend/src/kpis/canales.ts` contienen las mismas funciones con los mismos
nombres, y cada paquete arranca con un índice que dice qué KPI vive en qué
archivo. La alternativa —un archivo grande por lado— funcionaba, pero encontrar
un cálculo era leer 300 líneas y cambiarlo era editar sin saber qué gemelo
tocaba. `kpis/catalogo.ts` cierra el círculo del lado de la lectura: el rótulo,
el formato y la definición de cada métrica en pantalla salen de ahí, así que
cambiar cómo se llama o qué significa un número es una línea, no una búsqueda.

---

## El panel es una rejilla, no un informe

La primera versión era un solo scroll: nueve secciones del mismo peso, cada una
con un `<h2>` de 20px y un párrafo explicativo ARRIBA de su tarjeta. Leía bien
como documento y muy mal como tablero — el resumen medía 3.950px de alto, así que
para ver seis cifras había que recorrer cuatro pantallas, y nada indicaba cuál
mirar primero.

Ahora cada segmento es una rejilla de tarjetas y el título vive adentro de la
tarjeta, en 13px con una línea de contexto. El resumen quedó en 1.230px: la
franja de indicadores, la serie del año, el recorrido, la mezcla de canales, el
riesgo operativo y la cartera detenida entran en pantalla y media. Lo que se
perdió es espacio para prosa; lo que se ganó es que la pregunta «¿cómo va el
negocio?» se contesta sin scrollear.

Dos cosas que el cambio obligó a resolver:

- **Las píldoras de variación** existen solo donde hay con qué compararse. La
  única serie mensual del panel es `cohortes` (leads, ganados, tasa), así que la
  conversión y el volumen llevan píldora y el resto no. Un porcentaje inventado
  en una esquina se lee como tendencia y no hay forma de que el lector sepa que
  no lo es.
- **Los `viewBox` de los SVG** estaban peleados con `preserveAspectRatio`. Un
  `height` fijo más `width="100%"` escala por el menor de los dos factores, así
  que sobraba espacio en un eje siempre: la serie de cohortes dibujaba 78px
  dentro de una caja de 240px y el gráfico de detenidos ocupaba 487px de una
  tarjeta de 1.232px. Con `height: auto` el alto lo fija la proporción, y el
  `ANCHO` de cada gráfico se calibró al ancho real de la tarjeta donde vive.

---

## Qué se mide arriba, y por qué esos cinco

La primera versión del panel mostraba lo que el modelo de datos ofrecía. La
versión actual muestra lo que cambia una decisión, y son cinco cifras: **ventas**
(el resultado), **leads** (el insumo), **conversión** (la eficiencia), **cartera
viva** (lo que queda por delante) y **ciclo de venta** (cuánto tarda). Es el
juego mínimo con el que se puede responder «¿cómo vamos y qué esperamos?».

Lo que salió de ahí y por qué:

- **«Escalados sin respuesta»** era un indicador en la franja. Es un problema, no
  un indicador de salud: mezclado con los KPIs le sacaba lugar a una cifra que se
  mira todos los días, y encima aparecía tres veces en la misma pantalla. Ahora
  vive una sola vez, en «Qué hay que arreglar», que además dice qué hacer.
- **«Llegan a test drive»** es un buen indicador adelantado, pero es un paso del
  embudo: se ve mejor en el recorrido, con la caída de cada salto al lado.
- **Las tarjetas de «riesgo operativo»** se eliminaron enteras. Decían lo mismo
  que los hallazgos, con menos contexto y sin acción.
- **La tabla de herramientas del asistente** salió de Equipo. Es la única cifra
  del panel cuyo dueño no está en comercial: la falla de una tool se arregla en
  producto, una vez, y ninguna decisión del segmento («a quién le pido qué»)
  cambia según lo que diga. El dato sigue disponible en `/api/herramientas`, con
  su gemelo en TS y su comparación en `npm run verify`.

Y dos cifras que hubo que **arreglar**, no solo mover:

- **El ciclo de venta.** La franja mostraba «mediana en el embudo: 11,2 días», y
  eso se lee como cuánto tarda una venta. No lo es: la mediana sobre *todos* los
  leads incluye a los que mueren en días. Sobre los que compran son **25,0
  días** — más del doble, y es el número con el que se planifica. Ahora se
  calculan los dos, con nombres distintos.
- **El pipeline.** «14.361 abiertos» no es cartera: 8.738 de esos leads no se
  mueven hace más de 90 días. La cifra honesta es la **cartera viva**, 5.623.
  Publicar el total infla el pronóstico un 61%.

## Los segmentos se dividen por decisión, no por tabla

El menú tenía seis entradas, una de ellas «Operación IA». Esa división es por
tecnología: nadie en comercial se pregunta cómo va la IA, se pregunta si al lead
lo atendieron. Peor, partía en dos una misma pregunta — el hallazgo más caro del
panel (2.233 leads escalados que nadie contestó) cae justo en la costura entre el
asistente y el vendedor.

Quedaron cuatro, y cada una habilita una decisión distinta:

| Segmento | La pregunta | Qué se hace con la respuesta |
|---|---|---|
| **Resumen** | ¿Cómo va el negocio? | Se mira todos los días |
| **Canales** | ¿Dónde pongo el presupuesto? | Se mueve inversión entre canales y orígenes |
| **Embudo** | ¿Qué parte del proceso arreglo? | Se interviene el salto que más cae |
| **Equipo** | ¿A quién le pido qué? | Se asignan leads y se corrige el SLA de respuesta |

Metodología va aparte y abajo: se consulta, no se recorre.

---

## El panel habla el idioma del negocio; el anexo habla el técnico

El panel arrastraba el vocabulario con el que fue construido: «cohorte»,
«censura», «madurez», «p75», «SLA», «snapshot», y hasta la ruta del archivo donde
se calcula cada métrica, en un globo del resumen. Nada de eso ayuda a decidir; la
prueba es que hubo que explicar qué era una cohorte.

Las cuatro pantallas de trabajo quedaron sin una sola palabra de implementación:

| Antes | Ahora |
|---|---|
| «Conversión por cohorte de entrada» | «Conversión según el mes en que entró el lead» |
| «Cohorte madura» | «Mes ya comparable» |
| «ventana de observación de 30 días» | «compraron en sus primeros 30 días» |
| «la caída del final es censura» | «un mes recién entrado no lleva menos ventas por ser peor, sino por llevar menos tiempo» |
| «Se calcula en kpis/resumen» (en un globo) | *(fuera; vive en el diccionario de Metodología)* |
| «KPIs calculados en SQL sobre PostgreSQL» | «Conectado en vivo a la base» |

**Metodología se queda técnica a propósito** y lo dice al entrar: es el respaldo
para quien quiera auditar de dónde sale cada número. Ahí sí van los nombres de
tabla, los umbrales medidos y el archivo `.ts`/`.py` de cada métrica. Sacarlo
habría abaratado el panel — un tablero que dice «limpiamos los datos» sin mostrar
qué sacó pide un acto de fe. La decisión no fue esconderlo, fue separarlo por
audiencia.

## El gráfico de cohortes y el embudo duplicado

Dos problemas de la misma familia: gráficos que no se entienden solos.

**La serie mensual** mostraba volumen y conversión en dos paneles y necesitaba
tres líneas de pie de foto para desmentir lo que insinuaba — la última cohorte
cae a 0,2% y se lee como un derrumbe cuando es censura. Quedó una sola línea, con
el eje ajustado al rango real (de 0-15% una caída de un tercio de la tasa se veía
como un escalón), una referencia con el promedio de los meses comparables, y los
meses que no cumplieron la ventana fuera de la escala: una zona apagada. Se probó
ponerlos con una flecha y su valor de hoy, pero una cifra dentro del gráfico se
lee como un punto más de la serie.

Faltaba lo más importante, y salió de una pregunta del cliente: la zona apagada
decía «Todavía sin cerrar», y lo primero que preguntó fue si los otros meses no
tenían también leads sin cerrar. Los tienen — ago, sep y oct se estacionan en un
33% abierto y su cifra ya no se mueve; may 2026 estaba en 64% y jun en 99,5%. Pero
la pregunta destapó que el problema no era el rótulo: la línea graficaba el
resultado ACUMULADO de cada mes, o sea meses de 350 días al lado de meses de 46.
El umbral de madurez que los declaraba comparables (37 días, el p75 de días hasta
cualquier estado terminal) lo dominaban las pérdidas, que cierran rápido; para las
VENTAS el p75 es 93 días. Así, un mes «maduro» llevaba cerca de un tercio de sus
ventas y la serie dibujaba una caída que era la edad de las cohortes.

Ahora la línea es la conversión DENTRO DE LA VENTANA (30 días para todos) y la
zona apagada dice «Aún sin sus 30 días», que es exactamente lo que le falta a esos
meses. El acumulado sigue en el globo, con su rótulo propio y la advertencia de
que va a seguir creciendo — sacarlo hubiera escondido el dato que el gerente
igual va a querer ver.

**El embudo** tenía tres gráficos de barras horizontales seguidos, y dos eran los
mismos números dibujados de dos formas. Quedó uno, y al lado la tabla con lo que
el resumen no puede mostrar: cuántos días vive un lead en cada etapa y cuántos
están esperando ahí ahora mismo. Eso —y no repetir el embudo— es lo que justifica
entrar a la pantalla.

---

## El segmento de presupuesto no contestaba su propia pregunta

Se llamaba **Demanda** y eran tres tarjetas apiladas, ninguna con información
que Resumen no tuviera: barras de leads y
conversión por canal (la misma mezcla del resumen, con otra forma), la tabla de
campañas pagadas, y **el mismo `ConversionChart` de Resumen**, pixel por pixel.
Una pantalla de detalle se justifica mostrando lo que el resumen no puede.

Lo que no podía mostrar era **el tiempo adentro de un canal**. `canales` es un
agregado de doce meses: dice que Meta Ads convierte al 4,5% y esconde el
movimiento mes a mes, incluido el pico de volumen de nov 2025 (3.555 leads contra
~950 de base). Sobre el promedio de doce meses no se decide nada. El KPI nuevo es
`canales_mes`, con la MISMA ventana de observación que `cohortes` —decidida por
mes y no por mes×canal, para que las cuatro líneas se corten en el mismo punto y
no en cuatro según a qué hora entró el último lead de cada canal.

Que sea la misma ventana no es cosmético: sobre el acumulado, Meta Ads
«se derrumbaba» de 7,2% (jul 2025) a 2,2% (abr 2026), y medido a 30 días esos dos
meses son 1,2% y 0,8%. Buena parte de ese derrumbe era tiempo que a los meses
nuevos todavía les falta, y con dos gráficos midiendo distinto el panel se
contradecía a sí mismo entre Resumen y Adquisición.

Lo segundo que faltaba era **el grano de abajo del canal**. `origen_detalle`
estaba en `fct_leads` y no se dibujaba en ninguna parte: dentro de «Orgánico», el
perfil de Instagram convierte al 35,9% y el botón del sitio al 17,2%, con el
botón trayendo cuatro veces más volumen. El promedio del canal (24,7%) no
describe a ninguno de los dos, y repartir presupuesto sobre él reparte igual
entre dos fuentes que rinden el doble una que la otra. El KPI nuevo es
`origenes`, y **subsume a `campanas`**: los tres orígenes del canal pagado SON
las tres campañas. En vez de dos tablas que cuentan lo mismo quedó una sola,
jerárquica —canal y debajo sus fuentes—, con el nombre de la campaña en lugar del
id numérico de Meta. `campanas` sigue viva como endpoint suelto, junto a `demanda`
y `no_show`; simplemente salió del panel.

Los dos indicadores nuevos de la franja son la pregunta en dos números: qué parte
de los **leads** trae el canal más grande (44,6%) contra qué parte de las
**ventas** produce (20,2%). Ninguno de los dos dice nada solo; la distancia entre
ellos es el tamaño del desajuste, y por eso van uno al lado del otro y no en
tarjetas distintas.

**Y pasó a llamarse Canales.** «Demanda» era el único segmento nombrado con una
abstracción: Embudo y Equipo nombran el objeto y dejan la decisión en el
subtítulo. Peor, la palabra ya estaba tomada — `kpis/demanda.py` mide qué pide el
mercado (modelo, presupuesto, forma de pago) y ese corte no está en esa pantalla
ni en ninguna. Un segmento «Demanda» que no muestra `demanda` es una trampa para
quien mantenga esto; renombrarlo además deja la palabra libre para cuando ese
corte tenga dónde vivir. Se consideró «Adquisición» —el término que el código ya
usa en la cinta del hallazgo—, y perdió por lo mismo que gana en un documento:
es mejor nombre de categoría y peor nombre de botón.

Lo que sigue faltando es el costo. Sin inversión por canal no hay CAC ni ROAS, y
lo más cerca que llega el panel es «cuántas ventas produce cada canal», no «cuánto
cuesta cada venta».

---

## Equipo: una franja y cuatro tarjetas para ocho personas

El segmento con menos datos del panel era el que más superficie ocupaba. Ocho
vendedores, y para describirlos había cinco indicadores en franja y cuatro
tarjetas. Dos de esas tarjetas —el ranking de cierre y el de respuesta— eran
**dos columnas de la tabla dibujadas como barras**: la misma cifra, tres veces,
en tres bloques que había que cruzar para armar una sola conversación con una
persona. Una barra horizontal ordenada no dice nada que la fila de esa persona no
diga mejor, y encima obliga a elegir entre el porcentaje y la cantidad.

Quedaron dos bloques. Arriba, la comparación que justifica el segmento: un lead
transferido que **recibe respuesta convierte 11,1%**, y uno que no, **3,1%** —
2.233 leads. Abajo, **una fila por persona** con las tres cosas que se le pueden
pedir a alguien, en el mismo renglón:

| | Qué se le pide |
|---|---|
| **cierra** | conversión en el canal pagado, con la total y su mezcla al lado |
| **responde** | qué parte de lo que le transfieren deja sin contestar |
| **sostiene** | con qué cartera activa se quedó, y cuánta está parada +90 días |

La vara del equipo bajó al **pie de cada columna**, en vez de vivir en la esquina
de la tarjeta o en una línea vertical dentro de un gráfico. Con nueve columnas, un
promedio escrito arriba obliga a recordar un número mientras se recorre la fila;
en el pie cae debajo de la cifra que se compara. Y es el total de esa columna
sobre las mismas filas visibles: un total traído de otro KPI se lee como un error
de cuadratura aunque los dos números estén bien.

La franja **salió entera**. Tres de sus cinco cifras las publican ahora la tabla o
el gráfico (los transferidos, los que quedaron sin respuesta, la conversión del
equipo en pagado). La cuarta, el no-show, no cambia ninguna decisión de este
segmento: va de 14,9% a 16,9% entre las ocho personas, así que no hay a quién
pedirle nada — un indicador que no se puede repartir entre personas no pertenece a
Equipo (sigue en `/api/no-show`). Y la quinta, la brecha, quedó en la esquina de
la tabla junto a su espejismo: **1,9× la diferencia real** dentro del canal
pagado, **4,9× la aparente** si se mira la conversión sobre todos los leads. Las
dos juntas son el hallazgo; una sola es media conversación.

## Lo que dejaría para una segunda vuelta

- **Tests unitarios del perfilado** sobre bases sintéticas: hoy las reglas están
  validadas contra los datos reales, pero no contra casos borde construidos a
  propósito (una tabla vacía, una columna 100% nula, un JSON con una sola clave).
- **Comparar dos datasets en el mismo panel**: hoy el API resuelve siempre el
  export más reciente y no hay forma de poner dos lado a lado.
- **Tests de componente** del panel: hoy la corrección de los números está
  cubierta por `npm run verify`, pero el render no tiene red de seguridad.
- **Costo por canal**, si aparece la fuente: cambia la recomendación de presupuesto
  de "convierte peor" a "cuesta $X por venta".
