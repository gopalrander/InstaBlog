# ADR 0005: Structured logging and OpenTelemetry tracing

## Status

Accepted

## Context

The provider and agent pipeline will cross HTTP, background jobs, and a Python ML service. Local debugging needs request correlation and timing without creating a proprietary observability model or persisting sensitive payloads in application tables.

## Decisions

1. Fastify's Pino logger remains the structured application log mechanism.
2. OpenTelemetry is the tracing standard. The API uses the official Node SDK, HTTP instrumentation, Undici instrumentation, and Fastify's maintained `@fastify/otel` adapter.
3. Traces export over OTLP/HTTP. Local development sends them to Jaeger v2 at `http://localhost:4318/v1/traces`.
4. Jaeger uses transient in-memory storage and is available only on loopback at `http://localhost:16686`.
5. Active OpenTelemetry `trace_id` and `span_id` fields are mixed into Pino records. Fastify's request ID remains a separate per-request log correlation field.
6. API responses include `x-trace-id` when a request span exists so browser failures can be located in logs and Jaeger.
7. Provider operations create explicit spans such as `provider.discover_media` and `provider.fetch_preview`. HTTP client spans remain automatic.
8. Health checks are excluded from traces to avoid noise.
9. Logs and span attributes contain operation metadata, status, duration, provider type, connection ID, counts, and pagination state. They must not contain passwords, cookies, OAuth codes, access tokens, refresh tokens, provider URLs, media bytes, filenames from private providers, or raw provider response bodies.
10. Tracing is disabled by default outside generated local configuration. Set `OTEL_TRACES_EXPORTER=otlp` to enable it.
11. Structured request logs record the route path without its query string. This prevents OAuth `code`, `state`, PKCE, and provider cursor values from entering logs.

## Libraries and alternatives

### Selected

- `@opentelemetry/api`
- `@opentelemetry/sdk-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/instrumentation-http`
- `@opentelemetry/instrumentation-undici`
- `@fastify/otel`

The broad `@opentelemetry/auto-instrumentations-node` bundle was rejected because V0 needs only HTTP, Fastify, and Undici. The deprecated contrib Fastify instrumentation was replaced with `@fastify/otel`, maintained by Fastify.

### Deferred

- Metrics remain deferred until product and worker measurements are defined.
- OpenTelemetry log export remains deferred; Pino JSON on stdout is the portable application log contract.
- Loki, Elasticsearch, and other log backends are not part of V0.

## Replacement boundary

Application code uses OpenTelemetry's vendor-neutral API only in `observability` helpers and transport wiring. Jaeger is a local OTLP backend and can be replaced by any OTLP-compatible service without changing application spans. Pino logs stay on stdout so deployment infrastructure can select its own collection backend.

## References

- https://opentelemetry.io/docs/languages/js/
- https://opentelemetry.io/docs/zero-code/js/
- https://github.com/fastify/otel
- https://www.jaegertracing.io/docs/2.20/getting-started/
