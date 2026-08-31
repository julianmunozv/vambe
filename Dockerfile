# Etapa 1 · el panel. `frontend/dist` está en .gitignore, así que el build se
# hace acá dentro: la imagen no depende de que alguien lo haya compilado antes.
FROM node:22-slim AS panel
WORKDIR /panel
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Etapa 2 · el API. Sirve el JSON de analytics.* y, en el MISMO origen, el
# build del panel: en producción no hay CORS ni un segundo servicio que caer.
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/

# main.py busca el build en RAIZ/frontend/dist, con RAIZ = padre de backend/.
# La ruta relativa del repo se conserva tal cual dentro de la imagen.
COPY --from=panel /panel/dist frontend/dist

# Forma shell a propósito: $PORT lo inyecta Railway en tiempo de arranque y
# tiene que expandirse. En exec form llegaría el literal "$PORT".
CMD uvicorn main:app --app-dir backend/api --host 0.0.0.0 --port ${PORT:-8077}
