# CLAUDE.md

Prueba técnica de Solutions Architect para Vambe: KPIs y dashboard sobre un
export SQLite de un concesionario (34.600 leads, 12 meses, 1,17 M de filas).
El enunciado está en `Prueba Técnica Solutions Architect-*.pdf`.

## Estructura

```
backend/
  etl/        pipeline SQLite → Postgres (ingesta, perfilado, staging, analytics)
  api/        FastAPI sobre analytics.*
    kpis/       un archivo por familia de KPI; __init__.py es EL ÍNDICE
  snapshot/   exporta fct_leads a un JSON — insumo de `npm run verify`, NO del panel
frontend/     React + TypeScript + Vite. Sin librería de charts: SVG a mano.
  src/kpis/     los mismos KPIs en TS, un archivo por familia con el MISMO
                nombre que su gemelo .py; index.ts es el índice. NO alimentan el
                panel: existen para que `npm run verify` contraste el SQL.
                Las tres excepciones sí se usan en pantalla:
                · catalogo.ts   rótulo, formato y definición de cada métrica
                · panorama.ts   la lectura ejecutiva (relee, no calcula)
                · hallazgos.ts  las reglas de las tres conclusiones
  src/paginas/  un archivo por segmento del menú lateral
  src/segmentos.ts  los segmentos del panel y su orden
docs/         decisiones.md (por qué está armado así)
data/raw/     el .db de origen — fuera de git, 180 MB
DESIGN.md     el lenguaje visual del panel (tokens, tipografía, sombras)
```

## Comandos

```bash
# ETL completo (~2 min con la ingesta; 17 s si ya está ingerido)
.venv/bin/python backend/etl/run.py --source data/raw/vambe_concesionaria.db

# Retomar una fase sin recargar todo
.venv/bin/python backend/etl/run.py --dataset <uuid> --desde perfilado --source <db>
.venv/bin/python backend/etl/run.py --dataset <uuid> --desde modelado

# API (sirve también frontend/dist si existe)
.venv/bin/uvicorn main:app --app-dir backend/api --port 8077 --reload

# Panel
cd frontend && npm run dev        # :5173, proxy /api → :8077
cd frontend && npm run build      # → frontend/dist

# Regenerar el insumo de verify (tras cualquier cambio en analytics.*)
.venv/bin/python backend/snapshot/build.py

# LA verificación que importa: SQL vs TypeScript, número por número.
# Necesita el API arriba — compara contra sus respuestas reales.
cd frontend && npm run verify

# Verify contra producción: el mismo chequeo, sobre el API desplegado.
cd frontend && npm run verify -- https://panel-production-5514.up.railway.app
```

## Despliegue

Railway, proyecto `vambe`: un servicio `panel` (la imagen del `Dockerfile`, que
compila el front y lo sirve desde el mismo FastAPI) más el Postgres. La infra se
declara en `.railway/railway.ts` — `railway.json` quedó deprecado por Railway y
se migró. El `package.json` de la raíz existe SOLO para que el CLI pueda evaluar
ese archivo; el panel sigue teniendo el suyo en `frontend/`.

```bash
railway config plan        # qué cambiaría en la infra
railway config apply       # aplicarlo
railway up --service panel # construir y desplegar
```

**El ETL no corre en Railway.** Necesita el `.db` de 180 MB y dejaría 304 MB en
`raw` que el API nunca lee: el API solo consulta `analytics.*` y
`control.datasets`, 63 MB. El pipeline se corre local y a producción va el
resultado. Postgres NO tiene proxy público —solo red privada—, así que la carga
entra por SSH al propio contenedor en vez de exponer la base a internet:

```bash
pg_dump "$DATABASE_URL" -n analytics -n control --no-owner --no-privileges -Fc -f vambe.dump
railway ssh config --service Postgres --alias vambe-pg -i ~/.ssh/id_ed25519
ssh vambe-pg 'psql "$DATABASE_URL" -c "DROP SCHEMA IF EXISTS analytics CASCADE; DROP SCHEMA IF EXISTS control CASCADE;"'
ssh vambe-pg 'pg_restore -d "$DATABASE_URL" --no-owner --no-privileges' < vambe.dump
```

Hay que dropear los esquemas antes: el API crea `control.*` al arrancar
(`schema.sql`) y sin eso el restore choca contra las tablas que él ya creó.

El healthcheck apunta a `/api/datasets`, no a `/`. La raíz la sirve
`StaticFiles` y respondería 200 con Postgres caído: el deploy quedaría verde
publicando un panel que no puede cargar un solo número.

## Invariantes — romper cualquiera invalida los números

**Los leads se cuentan SOLO desde `analytics.fct_leads`** (una fila = un lead).
Contar desde una tabla de grano más fino infla los totales: contar payloads en
vez de leads infla el canal orgánico un 20,3%.

**`raw` es una copia fiel del origen.** Ni un filtro, ni una columna descartada,
ni siquiera las que ya sabemos que son ruido. Filtrar ahí deja al perfilado sin
nada que detectar. Un contrato de fidelidad aborta el pipeline si los conteos no
calzan con el SQLite.

**El ruido no se nombra a mano.** Lo detectan tres reglas estadísticas
(`backend/etl/profile.py`) con sus umbrales y mediciones en
`backend/etl/config.yml`. Si hay que excluir un campo, se ajusta el umbral o se
agrega la razón al config — nunca un `WHERE columna <> 'x'` en una vista.

**El panel se sirve SIEMPRE desde el API.** No hay modo estático: si el API no
responde, el panel falla a la vista en vez de caer a otra fuente. Hubo un
snapshot que alimentaba un modo sin backend y se eliminó — publicaba 34.600 filas
a nivel de lead al navegador, y su fallback silencioso hacía que un API caído se
viera idéntico a uno sano.

**La lógica de negocio vive una sola vez, en SQL.** El TypeScript de `src/kpis/`
solo cuenta, promedia y saca percentiles sobre banderas ya decididas
(`es_ganado`, `transferido`, tramo de SLA, etapas alcanzadas). Si aparece una
regla de negocio nueva, va en `backend/snapshot/build.py` como columna derivada,
no en `frontend/src/kpis/`.

`panorama.ts` y `hallazgos.ts` son la excepción que confirma la regla: releen las
filas ya calculadas para ordenarlas por importancia y no deciden nada de negocio,
por eso no tienen gemelo en SQL. Si para armar un número ahí hay que decidir algo
—qué cuenta como ganado, dónde corta un tramo— ese número no va ahí.

**Todo `ORDER BY` de una ventana necesita desempate explícito.** 241 contactos
tienen dos transiciones en el mismo timestamp: ordenar solo por `ocurrido_en`
deja el desempate al planificador y el mismo dato produce números distintos en
cada reconstrucción. El desempate va por `orden_desde, orden_hasta` en las
transiciones y por `id` en los mensajes. Al agregar un `ROW_NUMBER`, `LEAD` o
`LAG`, agregar también el desempate.

**La zona horaria se impone en la conexión, no se hereda del servidor.**
Las marcas de tiempo son `timestamptz`, así que `date_trunc('month', ...)`
resuelve el mes en la zona de la SESIÓN. La base de desarrollo estaba en
`America/Santiago` y la de producción en `Etc/UTC`, y el mismo export dio
números distintos: `npm run verify` marcó 6 casos con ±1 venta en `ventas_mes`
—una venta cerrada 21:30 del 30 de septiembre en Santiago es de octubre en UTC—.
El concesionario es chileno y su septiembre es el de Santiago: la zona se
declara en `config.yml → semantica.zona_horaria` y `db.conectar` la pasa como
opción de arranque. No configurar la zona del servidor: eso arregla una máquina,
no el cálculo.

**Hay dos implementaciones de los mismos KPIs** — `backend/api/kpis/` y
`frontend/src/kpis/` — y deben coincidir. La de SQL es la que sirve al panel; la
de TypeScript existe solo para contrastarla, y esa redundancia es el único
chequeo independiente que tienen los números. Los archivos se llaman igual de los dos
lados (`canales.py` ←→ `canales.ts`), así que el gemelo de cualquier cálculo está
a un salto. **Después de tocar cualquiera de las dos, correr `npm run verify`.**
Ya atrapó tres bugs reales (doble redondeo, días redondeados que movían leads de
tramo, y una definición de "días en la etapa actual" que sumaba visitas
anteriores).

**El rótulo de una métrica es parte de su definición.** Cómo se llama, con qué
formato se muestra y qué mide exactamente salen de `frontend/src/kpis/catalogo.ts`
— no de un string suelto en un componente. Al agregar una métrica visible, se
agrega su entrada ahí; el panel la rotula, la explica al apuntarla y la lista en
el diccionario de Metodología sin tocar nada más.

## Convenciones

- **Todo en español**: nombres, comentarios, UI, docs. El dominio es chileno.
- **Los comentarios explican por qué, no qué.** Si un umbral, un orden o una
  estructura rara tiene una razón medida, va escrita al lado con el número.
- **Formato es-CL**: punto de miles, coma decimal. Está centralizado en
  `frontend/src/format.ts`.
- **Ningún valor se interpola en SQL.** Filtros por parámetro ligado; los
  literales que sí deben quedar en una vista se componen con `psycopg.sql`.
- **Nada de rutas fijas al `.db`**: la ruta de origen es siempre un argumento.
- **`DATABASE_URL` nunca hardcodeada** — entorno o `.env` (ver `.env.example`).

## Diseño del panel

**Los segmentos se dividen por DECISIÓN, no por tabla ni por tecnología.**
`src/segmentos.ts` define cuatro más Metodología: Resumen (cómo va) → Canales
(dónde pongo el presupuesto) → Embudo (qué parte del proceso arreglo) → Equipo
(a quién le pido qué). Hubo un segmento «Operación IA» y se eliminó: nadie de
comercial se pregunta cómo va la IA, se pregunta si están contestando — lo que
la IA escaló y nadie contestó vive en Equipo, en la columna «No contestó» de cada
vendedor, porque el hallazgo más caro del panel cae justo en la costura entre los
dos y ahí tiene dueño. La tabla de
herramientas del asistente sí salió del panel: su dueño está en producto, no en
comercial, y ninguna decisión de Equipo cambia con ella — quedó como endpoint
suelto, igual que `campanas`. Antes de agregar un segmento: si no cambia una decisión distinta de las
cuatro, es una tarjeta dentro de una que ya existe. El segmento vive en el hash,
así que un link a «Embudo» sigue apuntando ahí.

**Los cinco indicadores del Resumen son resultados, no diagnósticos.** Ventas
(resultado) · Leads (insumo) · Conversión (eficiencia) · Cartera viva (lo que
queda por delante) · Ciclo de venta (cuánto tarda). Lo que está roto NO va en la
franja: va en «Qué hay que arreglar», que además dice qué hacer. Una tarjeta de
alerta al lado de un KPI mezcla dos preguntas y le saca sitio a la que se mira
todos los días.

**Los filtros son uno solo para todo el panel** y viven en `App.tsx`. Si cada
segmento filtrara por su cuenta, dos podrían estar mirando poblaciones distintas
y nadie tendría cómo notarlo. Cambiar de segmento conserva el filtro: eso es lo
que permite filtrar por un canal en Adquisición y pasar a Embudo con el filtro
puesto.

**La cabecera y los filtros son UN solo bloque pegajoso** (`.tope`). Encadenar
dos `position: sticky` obliga a escribir el alto del primero en el `top` del
segundo, y ese número queda viejo apenas cambia la cabecera: quedaba una banda
transparente de 14px por la que pasaba el contenido, y ese mismo corrimiento se
comía el padding de `main` — la primera tarjeta terminaba pegada a los filtros.
No agregar un segundo elemento pegajoso con un `top` calculado a mano.

**El panel está escrito para un gerente; Metodología es el único anexo técnico.**
En Resumen, Canales, Embudo y Equipo no va ni una palabra de la implementación:
ni «cohorte», ni «censura», ni «p75», ni «SLA», ni nombres de tabla, ni rutas de
archivo, ni el stack. Si un término necesita que alguien lo explique, no va —
«cohorte» se dice «el mes en que entró el lead», «ventana de observación» se dice
«sus primeros 30 días», «p75» se dice «tres de cada cuatro». En **Metodología** sí
van: es la
pantalla para quien audita los números, lo dice de entrada, y ahí viven los
nombres de tabla, los umbrales y el archivo donde se calcula cada métrica.

**Cada segmento es una REJILLA, no un documento.** El título y la explicación van
ADENTRO de la tarjeta (`components/Tarjeta.tsx`), en 13px y una línea — nunca un
`<h2>` con un párrafo arriba. Ese patrón es lo que convertía el panel en un
informe de 4.000px de alto: seis líneas de texto para ver tres cifras. Las clases
de rejilla están en `styles.css` (`.franja`, `.c23`, `.c32`, `.c3`) y la
separación entre tarjetas es una sola variable, `--aire`.

**Resumen entra en pantalla y media**, y son tres zonas: cómo vamos (la franja y
la serie del año), dónde se pierde (recorrido y mezcla de canales) y qué hacer
(los hallazgos). Todo lo que muestra está también en los segmentos de detalle con
más columnas; este es el titular. Al agregar algo ahí, la pregunta es si se
entiende en cinco segundos sin leer una tabla — y si crece el alto, algo tiene
que salir.

**Una píldora de variación solo aparece si la variación existe.** `cohortes` da
serie mensual de leads, ganados y tasa; nada más. Las métricas sin serie
comparable no llevan píldora y la esquina queda vacía a propósito. Las
variaciones se calculan SOLO entre los dos meses comparables más recientes y SOLO
sobre la cifra de la ventana: contra el último mes del export se compararía con un
mes que todavía convierte, y sobre el acumulado el más nuevo de los dos siempre
pierde porque le faltan semanas de ventas que el otro ya tiene.

**Dos gráficos que dicen lo mismo son un gráfico.** El embudo tenía tres barras
horizontales seguidas y dos eran los mismos números dibujados distinto. Antes de
agregar un gráfico: si la forma repite una que ya está en la pantalla, o es una
tabla, o no va. Lo que justifica una pantalla de detalle es mostrar algo que el
resumen NO puede — en Embudo eso son los días por etapa y quién está esperando
ahora, no el mismo embudo otra vez.

Canales cayó en la misma trampa y de forma más cara: sus tres tarjetas eran la
mezcla de canales del resumen con otra forma, la tabla de campañas, y el MISMO
`ConversionChart` de Resumen. Lo que el resumen no puede mostrar ahí es el
**tiempo adentro de un canal** (`canales_mes`: el agregado dice 4,5% y esconde el
movimiento mes a mes) y el **grano de abajo del canal** (`origenes`: dentro de
orgánico, 35,9% contra 17,2%). `canales_mes` usa la MISMA ventana de observación
que `cohortes`, decidida por mes y no por mes×canal para que las cuatro líneas se
corten en el mismo punto. Que sea la misma medida no es cosmético: sobre el
acumulado Meta Ads «se derrumbaba» de 7,2% a 2,2% y medido a 30 días esos meses
son 1,2% y 0,8% — con dos gráficos midiendo distinto, el panel se contradecía
entre Resumen y Canales. `origenes` subsume a
`campanas` —los tres orígenes del canal pagado SON las tres campañas—, así que
`campanas` salió de `SECCIONES` y del tipo `Dashboard`: sigue como endpoint
suelto, con `demanda` y `no_show`.

**Equipo es UNA tabla, una fila por persona.** Fue el caso más caro de la misma
trampa: para ocho personas había cinco indicadores en franja y cuatro tarjetas, y
dos de esas tarjetas —el ranking de cierre y el de respuesta— eran dos columnas
de la tabla dibujadas como barras. Una barra no dice nada que la fila de la
persona no diga mejor, y separadas obligan a cruzar tres bloques para armar una
conversación con alguien. Quedó la tabla y nada más, con las tres cosas que se
le pueden pedir a alguien en el mismo renglón — cierra, responde, sostiene.
Antes de agregarle una tarjeta: si el dato es una columna más de esa persona, es
una columna.

**Y la comparación del traspaso también salió.** Era la tarjeta de arriba: dos
barras con la conversión de los leads transferidos que recibieron respuesta
(11,1%) contra los que no (3,1%). Publicaba UN hallazgo, no una decisión de este
segmento — a quién pedirle qué se contesta en la fila de la persona, y la columna
«No contestó» ya reparte esos mismos 2.233 leads entre las ocho, que es la forma
accionable del mismo dato. El hallazgo sigue en «Qué hay que arreglar» del
Resumen (`kpis/hallazgos.ts`), con su acción al lado, y los tramos completos
siguen servidos en /api/handoff. Un hallazgo no es un segmento: si un bloque de
Equipo no se puede repartir entre personas, no pertenece a Equipo — la misma
regla que ya había sacado al no-show de la franja.

**Una barra sin escala escrita miente.** La tarjeta de traspaso de Equipo eran
dos barras de 1.240px sobre una pista gris de borde a borde: una pista llena se
lee como 0-100%, así que el 11,1% se veía como un 91% justo al lado del número
que decía otra cosa. Ese gráfico ya no está, pero la regla queda: **toda barra
nueva lleva escrita la escala contra la que se mide, o no va.** Escribir el 0 y
el tope encima de la pista cuesta una línea; una barra que se lee al revés de su
propia cifra hace dudar de todo el panel.

**Nueve columnas son tres preguntas.** `DataTable` acepta `grupo`: las columnas
contiguas que comparten uno quedan bajo un encabezado común, con una línea
vertical que abre el bloque y baja por las filas. En Equipo son cierra, responde
y sostiene — las mismas tres que el segmento promete. Sin eso, las nueve pesaban
igual y la tabla se recorría como una planilla.

**El hilo bajo una cifra es la celda, no un ranking aparte.** `barra` dibuja
3px bajo el número, escalados al máximo de la columna sobre las filas visibles.
No contradice la regla de arriba —el ranking dibujado al lado de la tabla salió
del panel y no vuelve—: acá vive DENTRO de la celda de la persona, así que no
agrega un bloque ni una lectura. Va solo en columnas de una cifra sola: la pista
está anclada al borde derecho de la celda, y en «11,9% · 239» el hilo cae bajo el
239 y se lee como la barra de ESE número. Y solo cuando la fila tiene valor: con
el filtro por canal orgánico «Conv. en pagado» queda en «—» para las ocho
personas, y una pista gris bajo una raya se lee como una medición en cero.

**La vara de una columna va en el pie de la columna, no en la cabecera de la
tarjeta.** `DataTable` dibuja un `tfoot` si alguna columna declara `pie`. Con
nueve columnas, un promedio escrito arriba obliga a recordar un número mientras
se recorre la fila; abajo cae en la misma columna que la cifra que se compara. El
pie de una columna es el total o la tasa de ESA columna, sacado de las mismas
filas visibles: un total traído de otro KPI se lee como un error de cuadratura
aunque los dos números estén bien.

**La franja de indicadores es opcional, y en Equipo salió.** Tres de sus cinco
cifras ya las publicaba la tabla, y la cuarta —el no-show— no
cambia ninguna decisión del segmento: va de 14,9% a 16,9% entre las ocho
personas, así que no hay a quién pedirle nada (sigue en `/api/no-show`). Un
indicador que no se puede repartir entre personas no pertenece a Equipo.

**Un eje de porcentaje tiene que decir de qué es porcentaje.** `TendenciaCanales`
dibujaba «1,2%» sin nombrar la medida, y a diez centímetros la tarjeta de al lado
publicaba «4,5%» del mismo canal: dos conversiones distintas —la de los primeros
30 días y la de cualquier fecha— con el mismo nombre. El panel se leía como si
uno de los dos números estuviera mal. Ahora el eje se rotula igual que el de
volumen («Conversión a 30 días» arriba, «leads» abajo), el globo lleva la
definición en `texto`, y el pie cierra el puente con la cifra del agregado
calculada sobre la misma selección. Al poner dos medidas parecidas en una
pantalla: cada una dice cuál es, y una de las dos dice en qué se diferencia de la
otra.

**Los meses que no cumplieron la ventana no se dibujan sobre la escala.**
`ConversionChart` los deja en una zona apagada que dice «Aún sin sus 30 días»,
sin punto, sin flecha y sin cifra: cualquier número ahí adentro se lee como un
punto más de la serie, y su cifra todavía va a subir. El dato exacto está en el
globo. El rótulo dice qué les falta y no «todavía sin cerrar»: eso último se lee
como que los demás meses SÍ están cerrados, y no lo están —los viejos se
estacionan en ~33% abierto—, lo que los hace comparables es la edad, no el cierre.

**El `viewBox` de cada gráfico está calibrado al ancho de su tarjeta.** El CSS
fuerza `svg { height: auto }`: el alto lo decide la proporción del viewBox. Con
un `height` fijo, `preserveAspectRatio="meet"` escala por el MENOR de los dos
factores y siempre sobra espacio en un eje — la serie de cohortes dibujaba 78px
dentro de una caja de 240px, y el gráfico de detenidos 487px dentro de 1.232px.
Al mover un gráfico a una tarjeta de otro ancho hay que recalcular su `ANCHO`:
`ancho_tarjeta × altoViewBox / anchoViewBox` tiene que dar 210-240px.

`DESIGN.md` es la fuente: Geist, pesos 400/500/600 (nunca 700), escala de 4px,
borde como `box-shadow: 0 0 0 1px` (nunca `border`), azul `#0072F5` como único
acento de interfaz.

Los colores de **serie** son aparte y están validados para daltonismo (ΔE CVD
adyacente 9,1). No agregar una serie sin volver a validar la paleta. El amarillo
y el aqua quedan bajo 3:1 contra el blanco: todo gráfico que los use lleva
etiqueta directa visible y tabla al lado.

Tema único claro, por decisión — DESIGN.md define un sistema claro completo.

## Trampas de estos datos

- **El resultado acumulado de dos meses distintos NO se compara.** Junio 2025
  tuvo 350 días para convertir y abril 2026 tuvo 46; junio 2026, cero (99,5%
  abiertos, tasa aparente 0,2%). Toda vista por mes de creación mide la ventana
  (`tasa_ventana`: ventas dentro de los primeros 30 días del lead, umbral en
  `config.yml → cohortes.ventana_dias`) y marca con `medible` los meses que ya la
  cumplieron. El acumulado (`tasa_conversion`) puede mostrarse por mes, pero
  nunca como serie ni como eje: va en un globo, con su rótulo.
- **Un mes «maduro» no es un mes terminado.** Todos los meses tienen leads
  abiertos: los viejos se estacionan en ~33% y su cifra ya no se mueve. El umbral
  anterior (37 días, p75 de días hasta CUALQUIER estado terminal) lo dominaban las
  pérdidas, que cierran rápido; para las ventas el p75 es 93 días y al día 30 solo
  ocurrió un tercio de ellas. Por eso la comparación es a igual edad y no
  «esperar a que el mes termine».
- **«Negociación» tiene cero ocupantes** aunque pasaron 3.775 leads: es una etapa
  de paso. El embudo mide etapas *alcanzadas*, no la etapa actual.
- **La mediana de días del embudo NO es el ciclo de venta.** Sobre todos los
  leads da 11,2 d; sobre los que compran, 25,0 d — los que mueren rápido
  arrastran la mediana hacia abajo. Para planificar se usa `dias_a_venta`
  (`ciclo_venta` en el catálogo); `dias_mediana` mide otra cosa.
- **Los 14.361 leads abiertos no son pipeline.** 8.738 llevan más de 90 días sin
  moverse: el 61%. La cifra con la que se puede contar es la cartera viva
  (abiertos menos detenidos), y se calcula en `kpis/panorama.ts`.
- **La conversión cruda por vendedor mide el ruteo de leads, no el desempeño.**
  Comparar siempre dentro de canal.
- **Hay dos etapas terminales** y el esquema no dice cuál es éxito. Se identifica
  por nombre (`config.yml → semantica.etapa_exito`), nunca por orden.
