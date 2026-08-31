# Vambe Motors

Panel comercial construido sobre 34.600 leads y 12 meses de operación de un
concesionario. Incluye KPIs de ventas, canales, embudo y desempeño del equipo.

**Demo:** [autoideal.cl](https://www.autoideal.cl)

## Stack

- ETL de SQLite a PostgreSQL con Python.
- API de KPIs con FastAPI.
- Dashboard con React, TypeScript y Vite.
- Verificación cruzada de métricas entre SQL y TypeScript.

## Ejecución local

Requiere Python 3.12, Node.js 20+, PostgreSQL 14+ y el archivo
`vambe_concesionaria.db` dentro de `data/raw/`.

```bash
# Instalar dependencias
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

# Configurar y cargar los datos
cp .env.example .env
createdb vambe_dev
.venv/bin/python backend/etl/run.py --source data/raw/vambe_concesionaria.db

# Terminal 1: iniciar el API
.venv/bin/uvicorn main:app --app-dir backend/api --port 8077

# Terminal 2: iniciar el dashboard
cd frontend && npm run dev
```

El dashboard queda disponible en `http://localhost:5173` y requiere que el API
esté activo en el puerto `8077`.

## Estructura

```text
backend/etl/       Pipeline de ingesta y transformación
backend/api/       API y consultas de KPIs
frontend/          Dashboard web
docs/decisiones.md Decisiones de arquitectura
```

## Verificación

Con el API activo:

```bash
cd frontend && npm run verify
```

Este comando compara las implementaciones SQL y TypeScript sobre distintas
combinaciones de filtros.
