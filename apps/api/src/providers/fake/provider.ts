import {
  discoveryPageSchema,
  type DateRange,
  type DiscoveryPage,
  type ProviderCapabilities
} from "@instablog/contracts";
import { ProviderError } from "../errors.js";
import type {
  AuthorizationCode,
  AuthorizationRequest,
  OriginalAccess,
  PhotoProvider,
  PreviewResult,
  ProviderAccount,
  ProviderCredentials
} from "../types.js";

interface FakeProviderOptions {
  apiOrigin: string;
  enabled: boolean;
}

const sampleMedia = [
  ["rome-arrival", "2026-07-05T09:10:00Z", "Rome arrival", 1200, 800],
  ["colosseum-hero", "2026-07-06T10:30:00Z", "Colosseum", 1600, 1067],
  ["colosseum-burst", "2026-07-06T10:30:03Z", "Colosseum burst", 1600, 1067],
  ["florence-duomo", "2026-07-09T11:45:00Z", "Florence Duomo", 1400, 933],
  ["tuscany-road", "2026-07-11T16:20:00Z", "Tuscany road", 1500, 1000],
  ["venice-sunset", "2026-07-14T19:55:00Z", "Venice sunset", 1600, 900]
] as const;

export class FakePhotoProvider implements PhotoProvider {
  public readonly type = "fake";
  public readonly displayName = "Demo Photos";
  public readonly capabilities: ProviderCapabilities = {
    accessMode: "server_oauth",
    canEnumerateLibrary: true,
    canFilterByDateServerSide: true,
    canReadMediaBytes: true,
    canReadCaptureTime: true,
    canReadLocation: false,
    canReadExif: false,
    canGetThumbnail: true,
    canGetOriginal: true,
    canOpenInProvider: true
  };

  public constructor(private readonly options: FakeProviderOptions) {}

  public isConfigured(): boolean {
    return this.options.enabled;
  }

  public authorizationUrl(request: AuthorizationRequest): URL {
    const url = new URL("/providers/fake/authorize", this.options.apiOrigin);
    url.searchParams.set("state", request.state);
    url.searchParams.set("code_challenge", request.codeChallenge);
    return url;
  }

  public async exchangeCode(request: AuthorizationCode): Promise<ProviderCredentials> {
    if (request.code !== "approved") {
      throw new ProviderError("Demo provider authorization failed.", "authorization");
    }
    return {
      accessToken: "fake-access-token",
      refreshToken: "fake-refresh-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      scopes: ["demo.photos.read"]
    };
  }

  public async refreshCredentials(refreshToken: string): Promise<ProviderCredentials> {
    if (refreshToken !== "fake-refresh-token") {
      throw new ProviderError("Demo provider authorization expired.", "authorization");
    }
    return {
      accessToken: "fake-access-token-refreshed",
      refreshToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
      scopes: ["demo.photos.read"]
    };
  }

  public async getAccount(accessToken: string): Promise<ProviderAccount> {
    this.validateToken(accessToken);
    return { providerUserId: "local-demo-user" };
  }

  public async discoverMedia(
    accessToken: string,
    range: DateRange,
    cursor: string | null
  ): Promise<DiscoveryPage> {
    this.validateToken(accessToken);
    const page = cursor === null ? 0 : cursor === "fake:page:2" ? 1 : -1;
    if (page < 0) {
      throw new ProviderError("Demo provider cursor is invalid.", "invalid_response");
    }
    const matching = sampleMedia.filter(([, capturedAt]) => {
      const date = capturedAt.slice(0, 10);
      return date >= range.startDate && date <= range.endDate;
    });
    const selected = page === 0 ? matching.slice(0, 3) : matching.slice(3);
    return discoveryPageSchema.parse({
      status: page === 0 && matching.length > 3 ? "partial" : "complete",
      items: selected.map(([id, capturedAt, name, width, height]) => ({
        providerAssetId: id,
        mediaKind: "image",
        capturedAtUtc: capturedAt,
        capturedAtLocal: null,
        capturedOffsetMinutes: null,
        capturedTimeSource: "provider",
        contentHash: id === "colosseum-burst" ? "colosseum-similar" : `hash-${id}`,
        eTag: `etag-${id}`,
        width,
        height,
        mimeType: "image/svg+xml",
        filename: `${id}.svg`,
        providerMetadata: { title: name }
      })),
      nextCursor: page === 0 && matching.length > 3 ? "fake:page:2" : null,
      syncCursor: "fake:sync:1",
      warning: null
    });
  }

  public async fetchPreview(accessToken: string, mediaId: string): Promise<PreviewResult> {
    this.validateToken(accessToken);
    return {
      bytes: new TextEncoder().encode(this.renderSvg(mediaId)).buffer,
      contentType: "image/svg+xml"
    };
  }

  public async getOriginalAccess(accessToken: string, mediaId: string): Promise<OriginalAccess> {
    this.validateToken(accessToken);
    const url = new URL(`/providers/fake/media/${encodeURIComponent(mediaId)}`, this.options.apiOrigin);
    return { type: "provider_url", url: url.toString() };
  }

  public renderSvg(mediaId: string): string {
    const item = sampleMedia.find(([id]) => id === mediaId);
    if (!item) {
      throw Object.assign(new Error("Demo media not found."), { statusCode: 404 });
    }
    const [, , title] = item;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#17352d"/><circle cx="930" cy="190" r="120" fill="#d98f5f"/><path d="M0 620 280 360 470 540 690 290 1200 650V800H0Z" fill="#88a37a"/><text x="70" y="110" fill="#f4efe6" font-family="Georgia,serif" font-size="64">${this.escapeXml(title)}</text></svg>`;
  }

  private validateToken(accessToken: string): void {
    if (!accessToken.startsWith("fake-access-token")) {
      throw new ProviderError("Demo provider authorization is invalid.", "authorization");
    }
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }
}

