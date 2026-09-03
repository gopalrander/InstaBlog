import type { DatabasePool } from "../db/pool.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export class UserRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async create(email: string, passwordHash: string): Promise<UserRecord> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      password_hash: string;
    }>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash`,
      [email, passwordHash]
    );
    const user = result.rows[0];
    if (!user) {
      throw new Error("User insert did not return a record.");
    }
    return { id: user.id, email: user.email, passwordHash: user.password_hash };
  }

  public async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      password_hash: string;
    }>("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    return user ? { id: user.id, email: user.email, passwordHash: user.password_hash } : null;
  }
}

export class SessionRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [userId, tokenHash, expiresAt]
    );
  }

  public async findUserId(tokenHash: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      `UPDATE sessions
       SET last_seen_at = now()
       WHERE token_hash = $1 AND expires_at > now()
       RETURNING user_id`,
      [tokenHash]
    );
    return result.rows[0]?.user_id ?? null;
  }

  public async delete(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
  }
}

