# ADR 0001: V0 foundation guardrails

## Status

Accepted

## Decisions

1. The web application and API use server-side sessions. Session IDs are random, stored only in an HTTP-only `SameSite=Lax` cookie, and hashed in PostgreSQL.
2. Browser mutations require a double-submit CSRF token. CORS accepts only the configured web origin and credentials.
3. Passwords use Argon2id. Provider OAuth uses state bound to the current session and PKCE S256.
4. Provider tokens use AES-256-GCM with a random 96-bit nonce, connection-ID AAD, and a versioned key ID. Decryption accepts explicitly configured previous keys during rotation.
5. `provider_assets` are durable per-provider assets. `media_references` attach those assets to an album build so overlapping builds reuse derived analysis.
6. Capture time stores the available UTC instant, local wall time, offset, and source separately. Date ranges are inclusive local calendar dates.
7. Provider discovery is paginated and resumable. Credential refresh is serialized per connection and persisted atomically.
8. TypeScript fetches provider bytes and streams bounded content to the ML service. Python receives no provider credentials or provider URLs.
9. Jobs use leases, bounded attempts, dead-letter state, and a deterministic input version/idempotency key.
10. Derived user data cascades on deletion. Composite foreign keys enforce same-user links between builds, connections, and assets. Provider originals are never deleted.
11. Migration execution takes a PostgreSQL advisory lock and compiled builds include SQL migration assets.
12. Provider HTTP calls have explicit deadlines. Credential refresh uses a short database lease rather than holding transactions open across network calls.

## Deferred

- Embedding models and dimensions remain versioned data rather than fixed columns.
- Derived thumbnail caching requires a separate retention decision.
- OneDrive discovery strategy will be finalized after an API spike validates filtering, delta behavior, metadata, and throttling.
