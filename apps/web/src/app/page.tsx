"use client";

import { type FormEvent, useEffect, useState } from "react";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:3001";

interface Provider {
  type: string;
  displayName: string;
  configured: boolean;
}

interface Connection {
  id: string;
  provider: string;
  status: string;
}

interface MediaItem {
  providerAssetId: string;
  filename: string | null;
  capturedAtUtc: string | null;
  width: number | null;
  height: number | null;
  providerMetadata: { title?: string };
}

class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init.headers
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `Request failed (${response.status})` })) as {
      error?: string;
    };
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export default function HomePage() {
  const [csrfToken, setCsrfToken] = useState("");
  const [email, setEmail] = useState("demo@instablog.local");
  const [password, setPassword] = useState("local-demo-password");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [message, setMessage] = useState("Preparing local session...");
  const [busy, setBusy] = useState(false);

  const clearAuthenticatedState = (nextMessage: string): void => {
    setAuthenticated(false);
    setConnections([]);
    setMedia([]);
    setActiveConnection(null);
    setMessage(nextMessage);
  };

  const handleAuthenticatedError = (error: unknown, fallback: string): void => {
    if (error instanceof ApiError && error.status === 401) {
      clearAuthenticatedState("Your session ended. Sign in again.");
      setShowAuth(true);
      return;
    }
    setMessage(error instanceof Error ? error.message : fallback);
  };

  const refreshConnections = async (): Promise<void> => {
    try {
      const result = await api<{ connections: Connection[] }>("/connections");
      setConnections(result.connections);
      setAuthenticated(true);
      setMessage(result.connections.length ? "Ready to discover sample photos." : "Connect the demo provider.");
    } catch {
      setConnections([]);
      setAuthenticated(false);
      setMessage("Create or sign in to a local account.");
    }
  };

  useEffect(() => {
    void Promise.all([
      api<{ csrfToken: string }>("/auth/csrf"),
      api<{ providers: Provider[] }>("/providers")
    ]).then(([csrf, providerResult]) => {
      setCsrfToken(csrf.csrfToken);
      setProviders(providerResult.providers);
      return refreshConnections();
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Failed to initialize.");
    });
  }, []);

  const authenticate = async (event: FormEvent, action: "register" | "login"): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/auth/${action}`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: JSON.stringify({ email, password })
      });
      await refreshConnections();
      setShowAuth(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const connect = async (provider: string): Promise<void> => {
    setBusy(true);
    try {
      const result = await api<{ authorizationUrl: string }>(`/providers/${provider}/connect`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: "{}"
      });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      handleAuthenticatedError(error, "Provider connection failed.");
      setBusy(false);
    }
  };

  const discover = async (connectionId: string): Promise<void> => {
    setBusy(true);
    setActiveConnection(connectionId);
    setMedia([]);
    try {
      let cursor: string | null = null;
      const discovered: MediaItem[] = [];
      const visitedCursors = new Set<string>();
      let pageCount = 0;
      do {
        if (cursor && visitedCursors.has(cursor)) {
          throw new Error("Provider returned a repeated page cursor.");
        }
        if (cursor) {
          visitedCursors.add(cursor);
        }
        pageCount += 1;
        if (pageCount > 20) {
          throw new Error("Discovery paused after 20 pages. Album jobs will handle larger libraries.");
        }
        const page: { items: MediaItem[]; nextCursor: string | null } = await api(
          `/connections/${connectionId}/discover`,
          {
            method: "POST",
            headers: { "x-csrf-token": csrfToken },
            body: JSON.stringify({
              startDate: "2026-07-01",
              endDate: "2026-07-31",
              timezone: "America/Los_Angeles",
              cursor
            })
          }
        );
        discovered.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      setMedia(discovered);
      setMessage(`Found ${discovered.length} sample photos across two provider pages.`);
    } catch (error) {
      handleAuthenticatedError(error, "Discovery failed.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async (): Promise<void> => {
    setBusy(true);
    try {
      await api("/auth/logout", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: "{}"
      });
      clearAuthenticatedState("Signed out.");
    } catch (error) {
      handleAuthenticatedError(error, "Sign out failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <nav>
        <a className="brand" href="/">InstaBlog</a>
        {authenticated ? (
          <button className="secondary compact" disabled={busy} onClick={() => void logout()} type="button">
            Sign out
          </button>
        ) : (
          <button className="secondary compact" onClick={() => setShowAuth((visible) => !visible)} type="button">
            Sign in
          </button>
        )}
      </nav>

      {!authenticated && showAuth ? (
        <aside className="authPopover">
          <p className="step">Local account</p>
          <h2>Welcome back</h2>
          <form onSubmit={(event) => void authenticate(event, "register")}>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <label>
              Password
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
            </label>
            <div className="actions">
              <button disabled={busy || !csrfToken} type="submit">Create account</button>
              <button
                className="secondary"
                disabled={busy || !csrfToken}
                onClick={(event) => void authenticate(event, "login")}
                type="button"
              >
                Sign in
              </button>
            </div>
          </form>
        </aside>
      ) : null}

      <header className="hero">
        <p className="eyebrow">Provider-linked photo intelligence</p>
        <h1>Turn scattered photos into stories.</h1>
        <p className="lede">
          Connect the places your photos already live. InstaBlog reconstructs journeys, curates memorable moments, and builds an editable album without becoming another photo-storage service.
        </p>
        {!authenticated ? (
          <button onClick={() => setShowAuth(true)} type="button">Start with the local demo</button>
        ) : null}
      </header>

      {authenticated ? (
        <div className="workspace">
          <div className="workspaceHeading">
            <p className="eyebrow">Your workspace</p>
            <h2>Create an album</h2>
          </div>

          <section className="panel">
            <div>
              <p className="step">1 · Provider</p>
              <h2>Connect photos</h2>
            </div>
            <div className="providerList">
              {providers.map((provider) => (
                <article className="provider" key={provider.type}>
                  <div>
                    <strong>{provider.displayName}</strong>
                    <span>{provider.configured ? "Available" : "Not configured"}</span>
                  </div>
                  <button
                    disabled={busy || !provider.configured || connections.some((item) => item.provider === provider.type)}
                    onClick={() => void connect(provider.type)}
                    type="button"
                  >
                    {connections.some((item) => item.provider === provider.type) ? "Connected" : "Connect"}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div>
              <p className="step">2 · Discovery</p>
              <h2>July 2026 sample trip</h2>
            </div>
            {connections.length === 0 ? (
              <p className="muted">Connect the Demo Photos provider first.</p>
            ) : connections.map((connection) => (
              <button
                disabled={busy}
                key={connection.id}
                onClick={() => void discover(connection.id)}
                type="button"
              >
                Discover from {connection.provider}
              </button>
            ))}
          </section>

          <p className="status">{message}</p>

          {media.length > 0 && activeConnection ? (
            <section className="gallery" aria-label="Discovered sample photos">
              {media.map((item) => (
                <article className="photo" key={item.providerAssetId}>
                  <img
                    alt={item.providerMetadata.title ?? item.filename ?? "Sample photo"}
                    src={`${apiOrigin}/connections/${activeConnection}/media/${encodeURIComponent(item.providerAssetId)}/preview`}
                  />
                  <div>
                    <strong>{item.providerMetadata.title ?? item.filename}</strong>
                    <span>{item.capturedAtUtc?.slice(0, 10)} · {item.width}×{item.height}</span>
                    <a
                      href={`${apiOrigin}/connections/${activeConnection}/media/${encodeURIComponent(item.providerAssetId)}/original`}
                      target="_blank"
                    >
                      Open provider original
                    </a>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      ) : (
        <p className="landingStatus">{message}</p>
      )}
    </main>
  );
}
