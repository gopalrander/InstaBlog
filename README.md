# InstaBlog

InstaBlog is a provider-linked, agentic photo album builder. Originals remain with their providers; the application persists provider references and derived intelligence.

## Local development

Requirements:

- Node.js 24.19 LTS (the current V0 runtime contract)
- Docker Desktop with Compose (local PostgreSQL/pgvector only)

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The command creates an ignored `.env` with random local secrets, starts PostgreSQL/pgvector, applies migrations, and runs the API and web development servers.

The local page can create an account, connect the **Demo Photos** provider, discover two pages of synthetic July 2026 media, display temporary previews, and open provider originals. Set `ENABLE_FAKE_PROVIDER=false` to remove the demo provider.

Structured API logs are written to the terminal. Open `http://localhost:16686` for Jaeger traces and select the `instablog-api` service. API responses also include `x-trace-id`, which matches the `trace_id` field in logs and the trace ID in Jaeger.

Docker is a development host, not an application dependency. PostgreSQL can be supplied through any compatible local or hosted environment by changing `DATABASE_URL`.

## Selected libraries

The rationale, alternatives, and replacement boundaries for Fastify, Zod, `pg`, Argon2, Vitest, Next.js, PostgreSQL, and pgvector are recorded in [ADR 0002](docs/adr/0002-library-and-boundary-strategy.md). The fake provider and dependency-free local runner are documented in [ADR 0004](docs/adr/0004-local-demo-provider.md). Logging and tracing are documented in [ADR 0005](docs/adr/0005-observability.md). New material dependencies require a corresponding architecture decision.

## V0 invariants

- Never persist source-provider original image bytes.
- Persist provider asset IDs rather than expiring URLs.
- Scope every user-owned query by authenticated user ID.
- Keep provider credentials in the API process and encrypted at rest.
- Make background work idempotent, leased, and resumable.
- Exchange versioned structured records between stages.
