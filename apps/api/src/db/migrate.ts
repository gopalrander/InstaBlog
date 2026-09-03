import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvironment } from "../config/env.js";
import { createDatabasePool } from "./pool.js";

const directory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const environment = loadEnvironment();
const pool = createDatabasePool(environment.DATABASE_URL);
const lockId = 4_769_242_013;
const client = await pool.connect();

try {
  await client.query("SELECT pg_advisory_lock($1)", [lockId]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const name of (await readdir(directory)).filter((entry) => entry.endsWith(".sql")).sort()) {
    const applied = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1) AS exists",
      [name]
    );
    if (applied.rows[0]?.exists) {
      continue;
    }

    try {
      await client.query("BEGIN");
      await client.query(await readFile(join(directory, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock($1)", [lockId]).catch(() => undefined);
  client.release();
  await pool.end();
}
