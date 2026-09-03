import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../db/pool.js";
import type { ProviderCredentials } from "../providers/types.js";

export interface ProviderConnectionSummary {
  id: string;
  provider: string;
  status: string;
  scopes: string[];
  createdAt: Date;
  lastSyncAt: Date | null;
}

export interface ProviderConnectionIdentity {
  id: string;
  provider: string;
}

export class ConnectionRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async listForUser(userId: string): Promise<ProviderConnectionSummary[]> {
    const result = await this.pool.query<{
      id: string;
      provider: string;
      status: string;
      scopes: string[];
      created_at: Date;
      last_sync_at: Date | null;
    }>(
      `SELECT id, provider, status, scopes, created_at, last_sync_at
       FROM provider_connections
       WHERE user_id = $1
       ORDER BY created_at`,
      [userId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      status: row.status,
      scopes: row.scopes,
      createdAt: row.created_at,
      lastSyncAt: row.last_sync_at
    }));
  }

  public async saveProviderCredentials(
    userId: string,
    provider: string,
    providerUserId: string,
    credentials: ProviderCredentials,
    encrypt: (connectionId: string, plaintext: string) => string
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${userId}:${provider}:${providerUserId}`
      ]);
      const existing = await client.query<{ id: string }>(
        `SELECT id
         FROM provider_connections
         WHERE user_id = $1 AND provider = $2 AND provider_user_id = $3
         FOR UPDATE`,
        [userId, provider, providerUserId]
      );
      const connectionId = existing.rows[0]?.id ?? randomUUID();
      const accessToken = encrypt(connectionId, credentials.accessToken);
      const refreshToken = credentials.refreshToken
        ? encrypt(connectionId, credentials.refreshToken)
        : null;

      if (existing.rowCount) {
        await client.query(
          `UPDATE provider_connections
           SET encrypted_access_token = $1,
               encrypted_refresh_token = $2,
               token_expires_at = $3,
               scopes = $4,
               status = 'active',
               updated_at = now()
           WHERE user_id = $5 AND id = $6`,
          [accessToken, refreshToken, credentials.expiresAt, credentials.scopes, userId, connectionId]
        );
      } else {
        await client.query(
          `INSERT INTO provider_connections (
             id, user_id, provider, provider_user_id,
             encrypted_access_token, encrypted_refresh_token,
             token_expires_at, scopes
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            connectionId,
            userId,
            provider,
            providerUserId,
            accessToken,
            refreshToken,
            credentials.expiresAt,
            credentials.scopes
          ]
        );
      }
      await client.query("COMMIT");
      return connectionId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async deleteForUser(userId: string, connectionId: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM provider_connections WHERE user_id = $1 AND id = $2",
      [userId, connectionId]
    );
    return result.rowCount === 1;
  }

  public async findIdentityForUser(
    userId: string,
    connectionId: string
  ): Promise<ProviderConnectionIdentity | null> {
    const result = await this.pool.query<ProviderConnectionIdentity>(
      `SELECT id, provider
       FROM provider_connections
       WHERE user_id = $1 AND id = $2`,
      [userId, connectionId]
    );
    return result.rows[0] ?? null;
  }
}
