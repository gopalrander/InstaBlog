import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../db/pool.js";
import { ProviderError } from "../providers/errors.js";
import type { PhotoProvider } from "../providers/types.js";
import type { CredentialVault } from "../security/credential-vault.js";

const REFRESH_WINDOW_MS = 5 * 60 * 1_000;
const REFRESH_LEASE_MS = 30_000;
const REFRESH_WAIT_MS = 35_000;
const REFRESH_POLL_MS = 200;

interface ConnectionTokenRecord {
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  token_expires_at: Date | null;
  status: string;
}

export class ConnectionCredentialService {
  public constructor(
    private readonly pool: DatabasePool,
    private readonly vault: CredentialVault
  ) {}

  public async getValidAccessToken(
    userId: string,
    connectionId: string,
    provider: PhotoProvider
  ): Promise<string> {
    const deadline = Date.now() + REFRESH_WAIT_MS;
    while (Date.now() < deadline) {
      const connection = await this.readConnection(userId, connectionId, provider.type);
      if (!connection) {
        throw Object.assign(new Error("Provider connection not found."), { statusCode: 404 });
      }
      if (connection.status !== "active") {
        throw Object.assign(new Error("Provider connection requires authorization."), { statusCode: 409 });
      }
      if (!connection.token_expires_at || connection.token_expires_at.getTime() > Date.now() + REFRESH_WINDOW_MS) {
        return this.vault.decrypt(connection.encrypted_access_token, connectionId);
      }
      if (!connection.encrypted_refresh_token) {
        await this.pool.query(
          "UPDATE provider_connections SET status = 'expired', updated_at = now() WHERE user_id = $1 AND id = $2",
          [userId, connectionId]
        );
        throw Object.assign(new Error("Provider connection requires authorization."), { statusCode: 409 });
      }

      const leaseId = randomUUID();
      const lease = await this.pool.query<ConnectionTokenRecord>(
        `UPDATE provider_connections
         SET refresh_lease_id = $1,
             refresh_lease_expires_at = now() + ($2 * interval '1 millisecond')
         WHERE user_id = $3
           AND id = $4
           AND provider = $5
           AND status = 'active'
           AND encrypted_access_token = $6
           AND (refresh_lease_id IS NULL OR refresh_lease_expires_at < now())
         RETURNING encrypted_access_token, encrypted_refresh_token, token_expires_at, status`,
        [
          leaseId,
          REFRESH_LEASE_MS,
          userId,
          connectionId,
          provider.type,
          connection.encrypted_access_token
        ]
      );
      const claimed = lease.rows[0];
      if (!claimed?.encrypted_refresh_token) {
        await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_MS));
        continue;
      }

      try {
        const refreshToken = this.vault.decrypt(claimed.encrypted_refresh_token, connectionId);
        const refreshed = await provider.refreshCredentials(refreshToken);
        const updated = await this.pool.query(
          `UPDATE provider_connections
           SET encrypted_access_token = $1,
               encrypted_refresh_token = $2,
               token_expires_at = $3,
               scopes = $4,
               status = 'active',
               refresh_lease_id = NULL,
               refresh_lease_expires_at = NULL,
               updated_at = now()
           WHERE user_id = $5 AND id = $6 AND refresh_lease_id = $7`,
          [
            this.vault.encrypt(refreshed.accessToken, connectionId),
            refreshed.refreshToken
              ? this.vault.encrypt(refreshed.refreshToken, connectionId)
              : claimed.encrypted_refresh_token,
            refreshed.expiresAt,
            refreshed.scopes,
            userId,
            connectionId,
            leaseId
          ]
        );
        if (updated.rowCount !== 1) {
          throw new ProviderError("Provider credential refresh lease expired.", "upstream");
        }
        return refreshed.accessToken;
      } catch (error) {
        const expired = error instanceof ProviderError && error.kind === "authorization";
        await this.pool.query(
          `UPDATE provider_connections
           SET status = CASE WHEN $1 THEN 'expired' ELSE status END,
               refresh_lease_id = NULL,
               refresh_lease_expires_at = NULL,
               updated_at = now()
           WHERE user_id = $2 AND id = $3 AND refresh_lease_id = $4`,
          [expired, userId, connectionId, leaseId]
        );
        throw error;
      }
    }
    throw new ProviderError("Timed out waiting for provider credential refresh.", "upstream");
  }

  private async readConnection(
    userId: string,
    connectionId: string,
    provider: string
  ): Promise<ConnectionTokenRecord | null> {
    const result = await this.pool.query<ConnectionTokenRecord>(
        `SELECT encrypted_access_token, encrypted_refresh_token, token_expires_at, status
         FROM provider_connections
         WHERE user_id = $1 AND id = $2 AND provider = $3`,
      [userId, connectionId, provider]
    );
    return result.rows[0] ?? null;
  }
}
