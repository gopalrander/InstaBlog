import { randomBytes } from "node:crypto";
import { access, appendFile, readFile, writeFile } from "node:fs/promises";

const path = new URL("../.env", import.meta.url);

try {
  await access(path);
  const existing = await readFile(path, "utf8");
  const additions = [
    ["LOG_LEVEL", "debug"],
    ["OTEL_SERVICE_NAME", "instablog-api"],
    ["OTEL_TRACES_EXPORTER", "otlp"],
    ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://localhost:4318/v1/traces"]
  ].filter(([key]) => !existing.split(/\r?\n/).some((line) => line.startsWith(`${key}=`)));
  if (additions.length) {
    await appendFile(path, `${additions.map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
    process.stdout.write("Added missing local observability settings to .env\n");
  }
  process.stdout.write("Using existing .env\n");
} catch {
  const sessionSecret = randomBytes(32).toString("base64url");
  const encryptionKey = randomBytes(32).toString("base64");
  const content = [
    "NODE_ENV=development",
    "API_HOST=127.0.0.1",
    "API_PORT=3001",
    "API_PUBLIC_ORIGIN=http://localhost:3001",
    "WEB_ORIGIN=http://localhost:3000",
    "NEXT_PUBLIC_API_ORIGIN=http://localhost:3001",
    "DATABASE_URL=postgres://instablog:instablog@localhost:5432/instablog",
    `SESSION_SECRET=${sessionSecret}`,
    `TOKEN_ENCRYPTION_KEY=${encryptionKey}`,
    "TOKEN_ENCRYPTION_KEY_ID=local-v1",
    "ONEDRIVE_TENANT=common",
    "ONEDRIVE_REDIRECT_URI=http://localhost:3001/providers/onedrive/callback",
    "ENABLE_FAKE_PROVIDER=true",
    "LOG_LEVEL=debug",
    "OTEL_SERVICE_NAME=instablog-api",
    "OTEL_TRACES_EXPORTER=otlp",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces",
    ""
  ].join("\n");
  await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  process.stdout.write("Created ignored local .env with generated secrets\n");
}
