-- DDL idempotente. Corre al arrancar el API.
-- Solo tablas de control: raw/stg/analytics las crea el ETL por dataset.

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS stg;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS control;

CREATE TABLE IF NOT EXISTS control.datasets (
    id            uuid PRIMARY KEY,
    archivo       text        NOT NULL,
    bytes         bigint      NOT NULL,
    subido_en     timestamptz NOT NULL DEFAULT now(),
    estado        text        NOT NULL DEFAULT 'pendiente',
    -- reporte de perfilado: qué descartaron las reglas A/B/C y por qué.
    -- Se expone en la UI para que la decisión sea auditable, no una afirmación.
    perfil        jsonb,
    filas_origen  jsonb,   -- conteo por tabla del SQLite, para verificar fidelidad
    CONSTRAINT datasets_estado_ck
      CHECK (estado IN ('pendiente','ingiriendo','perfilando','modelando','listo','fallido'))
);

CREATE TABLE IF NOT EXISTS control.ingest_jobs (
    id            uuid PRIMARY KEY,
    dataset_id    uuid NOT NULL REFERENCES control.datasets(id) ON DELETE CASCADE,
    fase          text        NOT NULL DEFAULT 'encolado',
    progreso      integer     NOT NULL DEFAULT 0,
    detalle       text,
    error         text,
    iniciado_en   timestamptz NOT NULL DEFAULT now(),
    terminado_en  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_jobs_dataset ON control.ingest_jobs(dataset_id, iniciado_en DESC);
