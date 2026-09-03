import Fastify, { type FastifyInstance } from "fastify";
import { trace } from "@opentelemetry/api";
import { ZodError } from "zod";
import type { Environment } from "./config/env.js";
import type { DatabasePool } from "./db/pool.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerConnectionRoutes } from "./connections/routes.js";
import { securityPlugin } from "./plugins/security.js";
import { ProviderRegistry } from "./providers/registry.js";
import { OneDriveProvider } from "./providers/onedrive/provider.js";
import { FakePhotoProvider } from "./providers/fake/provider.js";
import { registerFakeProviderRoutes } from "./providers/fake/routes.js";
import { CredentialVault } from "./security/credential-vault.js";
import { serializeRequest } from "./observability/logging.js";

export interface AppDependencies {
  environment: Environment;
  database: DatabasePool;
}

function isExpectedHttpError(error: unknown): error is { statusCode: number; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    (error.statusCode < 500 || error.statusCode === 503) &&
    "message" in error &&
    typeof error.message === "string"
  );
}

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: dependencies.environment.LOG_LEVEL,
      mixin() {
        const spanContext = trace.getActiveSpan()?.spanContext();
        return spanContext
          ? { trace_id: spanContext.traceId, span_id: spanContext.spanId }
          : {};
      },
      serializers: {
        req: serializeRequest
      },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
          "*.accessToken",
          "*.refreshToken",
          "*.password"
        ],
        censor: "[REDACTED]"
      }
    }
  });

  app.decorate("environment", dependencies.environment);
  app.decorate("database", dependencies.database);
  const providers = new ProviderRegistry();
  providers.register(new OneDriveProvider({
    clientId: dependencies.environment.ONEDRIVE_CLIENT_ID,
    clientSecret: dependencies.environment.ONEDRIVE_CLIENT_SECRET,
    tenant: dependencies.environment.ONEDRIVE_TENANT,
    redirectUri: dependencies.environment.ONEDRIVE_REDIRECT_URI
  }));
  const fakeProvider = new FakePhotoProvider({
    apiOrigin: dependencies.environment.API_PUBLIC_ORIGIN,
    enabled: dependencies.environment.ENABLE_FAKE_PROVIDER
  });
  providers.register(fakeProvider);
  app.decorate("providers", providers);
  app.decorate(
    "credentialVault",
    new CredentialVault(
      dependencies.environment.TOKEN_ENCRYPTION_KEY_ID,
      dependencies.environment.TOKEN_ENCRYPTION_KEY
    )
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request." });
    }
    if (isExpectedHttpError(error)) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error({ err: error }, "Request failed");
    return reply.code(500).send({ error: "Internal server error." });
  });
  await app.register(securityPlugin);
  app.addHook("onSend", async (_request, reply, payload) => {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    if (traceId) {
      reply.header("x-trace-id", traceId);
    }
    return payload;
  });

  app.get("/health", { config: { otel: false } }, async () => {
    await app.database.query("SELECT 1");
    return { status: "ok" };
  });
  await registerAuthRoutes(app);
  await registerConnectionRoutes(app);
  await registerFakeProviderRoutes(app, fakeProvider);
  return app;
}
