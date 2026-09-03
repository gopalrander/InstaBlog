import type { DatabasePool } from "../db/pool.js";

export interface OAuthStateRecord {
  codeVerifier: string;
  redirectPath: string;
  expired: boolean;
}

export class OAuthStateRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async create(
    userId: string,
    provider: string,
    stateHash: string,
    codeVerifier: string,
    redirectPath: string,
    expiresAt: Date
  ): Promise<void> {
    await this.pool.query("DELETE FROM provider_oauth_states WHERE expires_at <= now()");
    await this.pool.query(
      `INSERT INTO provider_oauth_states (
         user_id, provider, state_hash, code_verifier, redirect_path, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, provider, stateHash, codeVerifier, redirectPath, expiresAt]
    );
  }

  public async cleanupExpired(): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM provider_oauth_states WHERE expires_at <= now()"
    );
    return result.rowCount ?? 0;
  }

  public async consume(userId: string, provider: string, stateHash: string): Promise<OAuthStateRecord | null> {
    const result = await this.pool.query<{
      code_verifier: string;
      redirect_path: string;
      expires_at: Date;
    }>(
      `DELETE FROM provider_oauth_states
       WHERE user_id = $1
         AND provider = $2
         AND state_hash = $3
       RETURNING code_verifier, redirect_path, expires_at`,
      [userId, provider, stateHash]
    );
    const state = result.rows[0];
    return state ? {
      codeVerifier: state.code_verifier,
      redirectPath: state.redirect_path,
      expired: state.expires_at.getTime() <= Date.now()
    } : null;
  }
}
