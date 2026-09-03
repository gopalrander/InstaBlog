# ADR 0004: Local demo provider and development runner

## Status

Accepted

## Context

The application needs an end-to-end local flow before external OAuth credentials or a consented photo tenant are available. The flow must validate real application boundaries rather than bypassing authentication, credential storage, provider pagination, or media access.

## Decisions

1. `FakePhotoProvider` implements the same `PhotoProvider` interface as OneDrive.
2. Its authorization endpoint redirects through the normal OAuth callback. Tokens are stored through the same encrypted connection repository.
3. Discovery returns two cursor-based pages of deterministic July 2026 sample media.
4. Preview and original actions use normal authenticated connection routes. The provider supplies generated SVG bytes and stores no files.
5. The fake provider is disabled unless `ENABLE_FAKE_PROVIDER=true`. The checked-in example remains disabled; only the ignored local environment generator enables it.
6. `npm run dev` uses a small Node standard-library script rather than adding a process-manager package.
7. `npm run setup:local` creates an ignored `.env` once with random local session and credential-encryption secrets.
8. Docker Compose remains responsible only for PostgreSQL/pgvector and binds it to loopback. The API and web run as direct local Node child processes so the runner can terminate them without leaving npm wrapper trees.

## Replacement and removal

The fake provider is an adapter, not a branch in album logic. It can be removed from provider registration without changing connection, discovery, media, or future album code. The development runner has no production role and can later be replaced by a workspace task runner if build complexity justifies one.
