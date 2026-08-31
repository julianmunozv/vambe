# Vambe Motors · Analytics & Dashboard

Prueba técnica de Solutions Architect. KPIs y panel comercial sobre un export
SQLite de una concesionaria: 34.600 leads, 12 meses, 1,17 M de filas de origen.

**Entregables**
- **[docs/informe.md](docs/informe.md)** — qué KPIs elegí, qué encontré, qué
  recomendaría y qué supuestos hice. *Empezar por acá.*
- **[docs/decisiones.md](docs/decisiones.md)** — por qué el stack y la
  arquitectura son estos.
- **El panel** — `frontend/`, React + TypeScript.
- **Las queries** — `backend/api/kpis/` (un KPI = una función = una query;
  el índice de todas está en su `__init__.py`).

---

## Cómo correrlo

**Requisitos:** Python 3.12, Node 20+, PostgreSQL 14+, y el archivo
`vambe_concesionaria.db` en `data/raw/` (no está en el repo: 180 MB).

```bash
# 1 · dependencias
python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

# 2 · base de datos
cp .env.example .env          # y editar DATABASE_URL
createdb vambe_dev

# 3 · pipeline completo
.venv/bin/python backend/etl/run.py --source data/raw/vambe_concesionaria.db

# 4 · API + panel
.venv/bin/uvicorn main:app --app-dir backend/api --port 8077 &
cd frontend && npm run dev    # http://localhost:5173
```

### El panel necesita el API

No hay modo sin backend: el panel consulta los KPIs en vivo y, si el API no
responde, lo dice en pantalla en vez de mostrar datos de otra procedencia.

---

## Estructura

```
backend/
  etl/        SQLite → Postgres. Cuatro fases, reanudables.
    ingest.py     copia fiel a raw.* — sin filtros, sin lógica de negocio
    profile.py    detecta ruido con tres reglas, sin nombrar ninguna columna
    config.yml    los umbrales y supuestos, con la medición que los justifica
    staging.py    vistas que limpian aplicando el reporte de perfilado
    analytics.py  las tablas de hecho que lee el panel
  api/        FastAPI
    kpis/         un archivo por familia de KPI; __init__.py es el índice
    filtros.py    el WHERE compartido por todas las queries
  snapshot/   exporta fct_leads para el arnés de verificación
frontend/     React + TypeScript + Vite. SVG a mano, sin librería de charts.
  src/kpis/     los mismos KPIs en TS, un archivo por familia con el MISMO
                nombre que su gemelo .py — más catalogo.ts (el diccionario de
                métricas), panorama.ts y hallazgos.ts
  src/paginas/  un segmento por archivo: Resumen, Canales, Embudo, Equipo y
                Metodología. Cada uno arma su rejilla de tarjetas.
  src/data/     source.ts — el cliente del API
  scripts/      verify.ts — compara las dos implementaciones contra el API
docs/         el informe y las decisiones de diseño
```

## Verificación

Los KPIs están implementados dos veces: en SQL (`backend/api/kpis/`) y en
TypeScript (`frontend/src/kpis/`, que no alimenta el panel: existe justamente
para este contraste). Los archivos se llaman
igual de los dos lados — `resumen.py` ←→ `resumen.ts` — así que el gemelo de
cualquier cálculo está a un salto. Que coincidan no es un acto de fe:

```bash
cd frontend && npm run verify
```

Corre las dos sobre ocho combinaciones de filtros y falla si alguna cifra se
separa. Encontró tres bugs reales durante el desarrollo.

El pipeline además verifica su propia fidelidad: si `raw` no tiene exactamente
las mismas filas que el SQLite de origen, aborta.
