import pg from "pg";

export type DatabasePool = pg.Pool;

export function createDatabasePool(connectionString: string): DatabasePool {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}

