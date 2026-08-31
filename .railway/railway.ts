import { defineRailway, postgres, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "ams" });
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "ams",
    sizeMB: 500,
  });

  // El panel y el API son UN servicio: FastAPI monta el build de Vite en "/",
  // así que en producción no hay CORS ni un segundo proceso que pueda caerse
  // por su cuenta y dejar el panel pidiéndole datos a un origen muerto.
  const panel = service("panel", {
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      // Apunta a un endpoint que TOCA la base, no a "/". La raíz la sirve
      // StaticFiles y respondería 200 con Postgres caído: el deploy quedaría
      // verde publicando un panel que no puede cargar un solo número.
      healthcheckPath: "/api/datasets",
      healthcheckTimeout: 120,
      // restartPolicy NO se declara: ON_FAILURE ya es el default de Railway y
      // la API lo devuelve como null, así que declararlo deja `railway config
      // plan` mostrando un cambio pendiente que nunca se aplica — y un plan que
      // siempre está sucio deja de servir para detectar drift real.
    },
    // Misma región que Postgres: la red privada no sale del datacenter. Va como
    // `regions` y no como `deploy.region`: Railway modela la ubicación con
    // multiRegionConfig, y puesto en deploy el plan lo reportaba como drift
    // pendiente en cada corrida sin llegar a aplicarse nunca.
    regions: { ams: 1 },
    env: {
      // Referencia al servicio, no la URL copiada: si Railway rota la
      // contraseña de Postgres, esto sigue apuntando bien.
      DATABASE_URL: Postgres.env.DATABASE_URL,
    },
  });

  return project("vambe", {
    resources: [Postgres, postgresVolume, panel],
  });
});
