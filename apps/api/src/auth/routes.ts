import { authRequestSchema } from "@instablog/contracts";
import argon2 from "argon2";
import type { FastifyInstance, FastifyReply } from "fastify";
import { createOpaqueToken, hashToken } from "../security/tokens.js";
import { SessionRepository, UserRepository } from "./repositories.js";

const SESSION_COOKIE = "instablog_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1_000;

function isUniqueViolation(error: unknown): error is { code: "23505" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt
  });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const users = new UserRepository(app.database);
  const sessions = new SessionRepository(app.database);
  const secureCookies = app.environment.NODE_ENV === "production";

  app.get("/auth/csrf", async (_request, reply) => {
    const token = createOpaqueToken();
    reply.setCookie("instablog_csrf", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      maxAge: SESSION_DURATION_MS / 1_000
    });
    return { csrfToken: token };
  });

  app.post("/auth/register", async (request, reply) => {
    const input = authRequestSchema.parse(request.body);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let user;
    try {
      user = await users.create(input.email, passwordHash);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Account could not be created." });
      }
      throw error;
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await sessions.create(user.id, hashToken(token), expiresAt);
    setSessionCookie(reply, token, expiresAt, secureCookies);
    return reply.code(201).send({ user: { id: user.id, email: user.email } });
  });

  app.post("/auth/login", async (request, reply) => {
    const input = authRequestSchema.parse(request.body);
    const user = await users.findByEmail(input.email);
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      return reply.code(401).send({ error: "Invalid email or password." });
    }

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await sessions.create(user.id, hashToken(token), expiresAt);
    setSessionCookie(reply, token, expiresAt, secureCookies);
    return { user: { id: user.id, email: user.email } };
  });

  app.post("/auth/logout", { preHandler: app.authenticate }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await sessions.delete(hashToken(token));
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });
}
