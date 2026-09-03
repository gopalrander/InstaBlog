# ADR 0003: OneDrive V0 provider behavior

## Status

Accepted provisionally; real-tenant validation remains required after an application registration is configured.

## Decisions

1. OneDrive uses Microsoft identity platform authorization code flow with PKCE S256.
2. V0 requests delegated `Files.Read` plus `openid`, `profile`, and `offline_access`. It does not request write access.
3. Discovery uses Microsoft Graph drive delta paging. `@odata.nextLink` continues the current enumeration; `@odata.deltaLink` is retained separately as provider sync state and is never treated as another page.
4. Capture-date filtering is client-side because `photo.takenDateTime` is not treated as a reliable server-side filter. When local EXIF wall time is unavailable, V0 compares the UTC calendar date and records a completeness warning.
5. Graph item IDs, hashes, eTags, and normalized metadata are durable. Graph download URLs are not persisted.
6. Preview responses are streamed with a 10 MiB bound. All identity and Graph HTTP calls have a 15-second deadline.
7. Original access currently resolves a fresh provider `webUrl` for opening the source item. Authenticated save/stream behavior will be added with the media API.
8. OAuth state is random, stored as a hash, bound to the authenticated user/provider, single-use, and expires after ten minutes. Expired state is cleaned on creation, startup, and hourly.
9. Credential refresh uses a 30-second PostgreSQL lease. No database transaction or row lock remains open during the external token call.

## Why native fetch

The initial connector uses a small number of stable HTTP endpoints. Native `fetch` keeps the adapter auditable and avoids importing a generated Graph client or a second token cache. The provider interface isolates this decision and permits replacement with the Graph SDK or MSAL later.

## Required real-tenant spike

Before calling the OneDrive vertical slice complete, validate with a consented development account:

- whether root delta returns all relevant descendant media for the account type;
- actual availability and timezone form of `photo.takenDateTime`;
- availability of `quickXorHash`, SHA-1, eTag, image dimensions, and MIME type;
- pagination size and throttling behavior;
- thumbnail redirect hosts and content headers;
- refresh-token rotation behavior for the registered confidential client.

The adapter and fixture tests intentionally do not claim these tenant-dependent observations are complete.

## References

- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/graph/api/driveitem-delta
- https://learn.microsoft.com/en-us/graph/api/resources/driveitem
- https://learn.microsoft.com/en-us/graph/api/driveitem-list-children
- https://learn.microsoft.com/en-us/graph/api/driveitem-get-content
- https://learn.microsoft.com/en-us/graph/permissions-reference

