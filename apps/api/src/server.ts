import "./observability/instrumentation.js";
import { buildApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import { createDatabasePool } from "./db/pool.js";
import { shutdownTelemetry } from "./observability/instrumentation.js";

const environment = loadEnvironment();
const database = createDatabasePool(environment.DATABASE_URL);
const app = await buildApp({ environment, database });

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  const watchdog = setTimeout(() => process.exit(1), 10_000);
  watchdog.unref();
  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, "Failed to close API cleanly");
    process.exitCode = 1;
  } finally {
    await database.end().catch((error: unknown) => {
      app.log.error({ err: error }, "Failed to close database pool");
      process.exitCode = 1;
    });
    await shutdownTelemetry().catch((error: unknown) => {
      app.log.error({ err: error }, "Failed to flush telemetry");
      process.exitCode = 1;
    });
    clearTimeout(watchdog);
  }
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});

await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
