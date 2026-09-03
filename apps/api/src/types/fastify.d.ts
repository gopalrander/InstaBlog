import type { Environment } from "../config/env.js";
import type { DatabasePool } from "../db/pool.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { CredentialVault } from "../security/credential-vault.js";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabasePool;
    environment: Environment;
    providers: ProviderRegistry;
    credentialVault: CredentialVault;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }

  interface FastifyRequest {
    userId?: string;
  }
}
