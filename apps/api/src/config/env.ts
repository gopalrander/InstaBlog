import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_PUBLIC_ORIGIN: z.string().url().default("http://localhost:3001"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().transform((value, context) => {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "must decode to exactly 32 bytes" });
      return z.NEVER;
    }
    return key;
  }),
  TOKEN_ENCRYPTION_KEY_ID: z.string().regex(/^[A-Za-z0-9._-]+$/).default("local-v1"),
  ONEDRIVE_CLIENT_ID: z.string().min(1).optional(),
  ONEDRIVE_CLIENT_SECRET: z.string().min(1).optional(),
  ONEDRIVE_TENANT: z.string().regex(/^[A-Za-z0-9.-]+$/).default("common"),
  ONEDRIVE_REDIRECT_URI: z.string().url().default("http://localhost:3001/providers/onedrive/callback"),
  ENABLE_FAKE_PROVIDER: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OTEL_SERVICE_NAME: z.string().min(1).default("instablog-api"),
  OTEL_TRACES_EXPORTER: z.enum(["none", "otlp"]).default("none"),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().default("http://localhost:4318/v1/traces")
});

export type Environment = z.infer<typeof envSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return envSchema.parse(source);
}
