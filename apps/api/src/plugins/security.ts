import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fp from "fastify-plugin";
import { SessionRepository } from "../auth/repositories.js";
import { hashToken, tokensEqual } from "../security/tokens.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const securityPlugin = fp(async (app) => {
  await app.register(cookie, { secret: app.environment.SESSION_SECRET });
  await app.register(cors, {
    origin: app.environment.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"]
  });

  const sessions = new SessionRepository(app.database);
  app.decorate("authenticate", async (request, reply) => {
    const token = request.cookies.instablog_session;
    if (!token) {
      return reply.code(401).send({ error: "Authentication required." });
    }
    const userId = await sessions.findUserId(hashToken(token));
    if (!userId) {
      return reply.code(401).send({ error: "Session is invalid or expired." });
    }
    request.userId = userId;
  });

  app.addHook("preHandler", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) {
      return;
    }
    const cookieToken = request.cookies.instablog_csrf;
    const headerToken = request.headers["x-csrf-token"];
    if (!cookieToken || typeof headerToken !== "string" || !tokensEqual(cookieToken, headerToken)) {
      return reply.code(403).send({ error: "Invalid CSRF token." });
    }
  });
});

