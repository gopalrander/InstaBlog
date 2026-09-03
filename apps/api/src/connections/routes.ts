import { z } from "zod";
import { dateRangeSchema } from "@instablog/contracts";
import type { FastifyInstance } from "fastify";
import { ConnectionCredentialService } from "./credential-service.js";
import { createPkcePair } from "../providers/oauth.js";
import { withProviderSpan } from "../observability/spans.js";
import { createOpaqueToken, hashToken } from "../security/tokens.js";
import { ConnectionRepository } from "./repository.js";
import { OAuthStateRepository } from "./oauth-repository.js";

const callbackQuerySchema = z.union([
  z.object({
    code: z.string().min(1),
    state: z.string().min(1)
  }),
  z.object({
    error: z.string().min(1),
    error_description: z.string().optional(),
    state: z.string().min(1)
  })
]);

const connectionParametersSchema = z.object({
  id: z.string().uuid()
});

const mediaParametersSchema = connectionParametersSchema.extend({
  mediaId: z.string().min(1)
});

const discoveryRequestSchema = dateRangeSchema.and(z.object({
  cursor: z.string().nullable().default(null)
}));

const OAUTH_STATE_DURATION_MS = 10 * 60 * 1_000;

export async function registerConnectionRoutes(app: FastifyInstance): Promise<void> {
  const connections = new ConnectionRepository(app.database);
  const credentials = new ConnectionCredentialService(app.database, app.credentialVault);
  const oauthStates = new OAuthStateRepository(app.database);
  await oauthStates.cleanupExpired();
  const cleanupTimer = setInterval(() => {
    void oauthStates.cleanupExpired().catch((error: unknown) => {
      app.log.error({ err: error }, "Failed to clean expired OAuth states");
    });
  }, 60 * 60 * 1_000);
  cleanupTimer.unref();
  app.addHook("onClose", async () => clearInterval(cleanupTimer));

  app.get("/connections", { preHandler: app.authenticate }, async (request) => ({
    connections: await connections.listForUser(request.userId!)
  }));

  app.get("/providers", async () => ({ providers: app.providers.list() }));

  app.post("/providers/:provider/connect", { preHandler: app.authenticate }, async (request) => {
    const providerType = z.object({ provider: z.string().min(1) }).parse(request.params).provider;
    const provider = app.providers.require(providerType);
    const state = createOpaqueToken();
    const pkce = createPkcePair();
    await oauthStates.create(
      request.userId!,
      provider.type,
      hashToken(state),
      pkce.verifier,
      "/",
      new Date(Date.now() + OAUTH_STATE_DURATION_MS)
    );
    request.log.info({ provider: provider.type }, "Provider authorization started");
    return {
      authorizationUrl: provider.authorizationUrl({
        state,
        codeChallenge: pkce.challenge
      }).toString()
    };
  });

  app.get("/providers/:provider/callback", { preHandler: app.authenticate }, async (request, reply) => {
    const providerType = z.object({ provider: z.string().min(1) }).parse(request.params).provider;
    const query = callbackQuerySchema.parse(request.query);
    const provider = app.providers.require(providerType);
    const oauthState = await oauthStates.consume(
      request.userId!,
      provider.type,
      hashToken(query.state)
    );
    if (!oauthState || oauthState.expired) {
      return reply.code(400).send({ error: "OAuth state is invalid or expired." });
    }
    if ("error" in query) {
      const redirect = new URL(oauthState.redirectPath, app.environment.WEB_ORIGIN);
      redirect.searchParams.set("provider", provider.type);
      redirect.searchParams.set("error", "authorization_declined");
      return reply.redirect(redirect.toString());
    }
    const credentials = await withProviderSpan("exchange_code", provider.type, () => provider.exchangeCode({
      code: query.code,
      codeVerifier: oauthState.codeVerifier
    }));
    const account = await withProviderSpan(
      "get_account",
      provider.type,
      () => provider.getAccount(credentials.accessToken)
    );
    const connectionId = await connections.saveProviderCredentials(
      request.userId!,
      provider.type,
      account.providerUserId,
      credentials,
      (id, token) => app.credentialVault.encrypt(token, id)
    );
    const redirect = new URL(oauthState.redirectPath, app.environment.WEB_ORIGIN);
    redirect.searchParams.set("provider", provider.type);
    redirect.searchParams.set("connection", connectionId);
    request.log.info({ provider: provider.type, connection_id: connectionId }, "Provider connected");
    return reply.redirect(redirect.toString());
  });

  app.delete("/connections/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = connectionParametersSchema.parse(request.params);
    if (!(await connections.deleteForUser(request.userId!, id))) {
      return reply.code(404).send({ error: "Provider connection not found." });
    }
    return reply.code(204).send();
  });

  app.post("/connections/:id/discover", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = connectionParametersSchema.parse(request.params);
    const range = discoveryRequestSchema.parse(request.body);
    const connection = await connections.findIdentityForUser(request.userId!, id);
    if (!connection) {
      return reply.code(404).send({ error: "Provider connection not found." });
    }
    const provider = app.providers.require(connection.provider);
    const accessToken = await credentials.getValidAccessToken(request.userId!, id, provider);
    const page = await withProviderSpan(
      "discover_media",
      provider.type,
      () => provider.discoverMedia(accessToken, range, range.cursor)
    );
    request.log.info({
      provider: provider.type,
      connection_id: id,
      media_count: page.items.length,
      has_next_page: page.nextCursor !== null
    }, "Provider discovery page completed");
    return page;
  });

  app.get(
    "/connections/:id/media/:mediaId/preview",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, mediaId } = mediaParametersSchema.parse(request.params);
      const connection = await connections.findIdentityForUser(request.userId!, id);
      if (!connection) {
        return reply.code(404).send({ error: "Provider connection not found." });
      }
      const provider = app.providers.require(connection.provider);
      const accessToken = await credentials.getValidAccessToken(request.userId!, id, provider);
      const preview = await withProviderSpan(
        "fetch_preview",
        provider.type,
        () => provider.fetchPreview(accessToken, mediaId)
      );
      return reply.type(preview.contentType).send(Buffer.from(preview.bytes));
    }
  );

  app.get(
    "/connections/:id/media/:mediaId/original",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { id, mediaId } = mediaParametersSchema.parse(request.params);
      const connection = await connections.findIdentityForUser(request.userId!, id);
      if (!connection) {
        return reply.code(404).send({ error: "Provider connection not found." });
      }
      const provider = app.providers.require(connection.provider);
      const accessToken = await credentials.getValidAccessToken(request.userId!, id, provider);
      const original = await withProviderSpan(
        "get_original_access",
        provider.type,
        () => provider.getOriginalAccess(accessToken, mediaId)
      );
      return reply.redirect(original.url);
    }
  );
}
