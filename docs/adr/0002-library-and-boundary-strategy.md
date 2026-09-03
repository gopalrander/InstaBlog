# ADR 0002: Library and boundary strategy

## Status

Accepted

## Context

V0 needs fast provider integration, explicit security controls, and reliable background work without becoming a distributed platform. Dependencies must earn their operational and conceptual cost. Domain behavior must remain portable if a selected library stops fitting the product.

## Decisions

### Fastify 5

Fastify is the HTTP adapter because it has a small core, TypeScript support, schema-friendly routing, and an explicit plugin lifecycle.

Alternatives considered:

- Express has a larger middleware ecosystem but weaker built-in structure and type integration.
- NestJS provides stronger conventions but adds dependency injection, decorators, and framework-specific architecture before V0 needs them.

Replacement boundary:

- Route handlers call application services and repositories.
- Domain records never depend on Fastify request or reply types.
- Fastify decorators are limited to transport concerns such as authentication and database lifecycle.

### Zod

Zod validates external input and defines shared web/API contracts.

Alternatives considered:

- TypeBox integrates directly with JSON Schema and Fastify compilation.
- Handwritten validation avoids a dependency but duplicates TypeScript definitions.

Replacement boundary:

- Zod is limited to transport and configuration boundaries.
- Database records and domain logic use plain TypeScript types.
- Python contracts use OpenAPI rather than importing TypeScript schemas.

### node-postgres (`pg`) without an ORM

The API uses parameterized SQL through thin repositories. Ownership filtering, locking, leases, pgvector, and migration behavior remain visible.

Alternatives considered:

- Prisma improves common CRUD ergonomics but complicates explicit locking, vector features, and SQL-first ownership review.
- Drizzle offers a thinner typed layer and remains a viable later option if query volume makes manual mapping costly.

Replacement boundary:

- SQL exists only in repositories and migrations.
- Services depend on repository interfaces or focused repository classes.
- HTTP handlers never issue SQL.

### Argon2

The `argon2` package provides Argon2id password hashing. Node's standard library does not provide Argon2.

Alternatives considered:

- bcrypt is mature but has older password-length and work-factor characteristics.
- scrypt is available from Node and remains a fallback if native Argon2 distribution becomes operationally difficult.

Replacement boundary:

- Password hashing will be wrapped behind a password hasher interface before another authentication method is added.
- Stored hashes retain their algorithm parameters and can be upgraded after successful login.

### Vitest

Vitest is the TypeScript test runner because it supports ESM and fast isolated tests with minimal configuration.

Alternatives considered:

- Node's built-in test runner removes a dependency but currently requires more setup for TypeScript execution and mocking.
- Jest has a broad ecosystem but adds ESM configuration complexity.

Replacement boundary:

- Tests use standard assertions and avoid runner-specific globals where practical.
- Production code never imports Vitest.

### Next.js and React

Next.js is the web adapter selected by the architecture handoff. V0 initially uses static/server-rendered pages and calls the separate Fastify API.

Alternatives considered:

- React with Vite is simpler for a pure SPA.
- A Fastify-served UI reduces processes but couples deployment and frontend concerns.

Replacement boundary:

- Shared request/response contracts live in `@instablog/contracts`.
- Product state and domain rules remain in the API.
- The web application does not import API repositories or database types.

### PostgreSQL and pgvector

PostgreSQL owns transactional application state, resumable jobs, and embeddings. pgvector avoids a separate vector database in V0.

Alternatives considered:

- Redis-backed queues add another service before load requires one.
- A dedicated vector database adds synchronization and operational cost.

Replacement boundary:

- Jobs are represented as domain tasks rather than PostgreSQL notifications.
- Embeddings are keyed by `model_id` and dimensions rather than fixed to one model.
- Queue claiming remains isolated in a job repository so a dedicated queue can replace it later.

### Platform security primitives

AES-256-GCM credential envelopes, opaque tokens, hashing, and constant-time comparisons use Node's `crypto` module. CSRF uses a small double-submit implementation.

Alternatives considered:

- General authentication frameworks would add providers, persistence assumptions, and callback abstractions not needed for the initial local account flow.
- Encryption wrappers obscure envelope versioning and connection-bound additional authenticated data.

Replacement boundary:

- Credential encryption is encapsulated by `CredentialVault`.
- Session persistence is encapsulated by `SessionRepository`.
- OAuth provider behavior will remain in connector-specific adapters.

### Native fetch for Microsoft Graph

The OneDrive V0 connector uses Node 24's standards-based `fetch` rather than Microsoft Graph's generated SDK.

Alternatives considered:

- The Microsoft Graph JavaScript SDK provides middleware and generated request helpers, but adds a broad dependency surface for a small initial endpoint set.
- MSAL can own token caching and refresh, but its cache model would compete with InstaBlog's encrypted connection records and serialized worker refresh lifecycle.

Replacement boundary:

- Graph URLs, response shapes, paging cursors, and errors exist only under `providers/onedrive`.
- The provider registry and `PhotoProvider` interface are unaware of Graph.
- A later Graph SDK or MSAL adapter can replace the connector without changing album or media domain records.

## Dependency policy

1. Prefer standard-library functionality for small, security-reviewable primitives.
2. Add a dependency when it removes substantial protocol, cryptographic, parsing, or compatibility risk.
3. Do not add Redis, a message broker, an ORM, an agent framework, or a vector service without a measured requirement.
4. Keep provider SDKs inside provider adapters.
5. Pin or override vulnerable transitive dependencies when a compatible patched version exists.
6. Record material library changes in a new ADR rather than rewriting this decision history.
