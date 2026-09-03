import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { FakePhotoProvider } from "./provider.js";

const authorizeQuerySchema = z.object({
  state: z.string().min(1),
  code_challenge: z.string().min(1)
});

const mediaParametersSchema = z.object({
  id: z.string().min(1)
});

export async function registerFakeProviderRoutes(
  app: FastifyInstance,
  provider: FakePhotoProvider
): Promise<void> {
  app.get("/providers/fake/authorize", { preHandler: app.authenticate }, async (request, reply) => {
    if (!provider.isConfigured()) {
      return reply.code(404).send({ error: "Demo provider is disabled." });
    }
    const query = authorizeQuerySchema.parse(request.query);
    const callback = new URL("/providers/fake/callback", app.environment.API_PUBLIC_ORIGIN);
    callback.searchParams.set("code", "approved");
    callback.searchParams.set("state", query.state);
    return reply.redirect(callback.toString());
  });

  app.get("/providers/fake/media/:id", { preHandler: app.authenticate }, async (request, reply) => {
    if (!provider.isConfigured()) {
      return reply.code(404).send({ error: "Demo provider is disabled." });
    }
    const { id } = mediaParametersSchema.parse(request.params);
    return reply.type("image/svg+xml").send(provider.renderSvg(id));
  });
}
