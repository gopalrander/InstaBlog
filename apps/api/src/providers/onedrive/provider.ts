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

const GRAPH_ORIGIN = "https://graph.microsoft.com";
const LOGIN_ORIGIN = "https://login.microsoftonline.com";
const GRAPH_SCOPES = ["openid", "profile", "offline_access", "Files.Read"];
const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
const HTTP_TIMEOUT_MS = 15_000;

interface OneDriveOptions {
  clientId: string | undefined;
  clientSecret: string | undefined;
  tenant: string;
  redirectUri: string;
}

interface GraphDriveItem {
  id: string;
  name?: string;
  eTag?: string;
  webUrl?: string;
  file?: {
    mimeType?: string;
    hashes?: {
      quickXorHash?: string;
      sha1Hash?: string;
    };
  };
  image?: {
    width?: number;
    height?: number;
  };
  video?: Record<string, unknown>;
  photo?: {
    takenDateTime?: string;
  };
  fileSystemInfo?: {
    createdDateTime?: string;
  };
  deleted?: Record<string, unknown>;
}

interface GraphPage {
  value?: GraphDriveItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

type Fetcher = typeof fetch;

export class OneDriveProvider implements PhotoProvider {
  public readonly type = "onedrive";
  public readonly displayName = "OneDrive";
  public readonly capabilities: ProviderCapabilities = {
    accessMode: "server_oauth",
    canEnumerateLibrary: true,
    canFilterByDateServerSide: false,
    canReadMediaBytes: true,
    canReadCaptureTime: true,
    canReadLocation: false,
    canReadExif: false,
    canGetThumbnail: true,
    canGetOriginal: true,
    canOpenInProvider: true
  };

  public constructor(
    private readonly options: OneDriveOptions,
    private readonly fetcher: Fetcher = fetch
  ) {}

  public isConfigured(): boolean {
    return Boolean(this.options.clientId);
  }

  public authorizationUrl(request: AuthorizationRequest): URL {
    const clientId = this.requireClientId();
    const url = new URL(`/${this.options.tenant}/oauth2/v2.0/authorize`, LOGIN_ORIGIN);
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: this.options.redirectUri,
      response_mode: "query",
      scope: GRAPH_SCOPES.join(" "),
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256"
    }).toString();
    return url;
  }

  public async exchangeCode(request: AuthorizationCode): Promise<ProviderCredentials> {
    return this.requestToken({
      grant_type: "authorization_code",
      code: request.code,
      code_verifier: request.codeVerifier,
      redirect_uri: this.options.redirectUri
    });
  }

  public async refreshCredentials(refreshToken: string): Promise<ProviderCredentials> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });
  }

  public async getAccount(accessToken: string): Promise<ProviderAccount> {
    const response = await this.graphFetch("/v1.0/me?$select=id", accessToken);
    const body = await this.readJson<{ id?: string }>(response);
    if (!body.id) {
      throw new ProviderError("OneDrive account response did not include an ID.", "invalid_response");
    }
    return { providerUserId: body.id };
  }

  public async discoverMedia(accessToken: string, range: DateRange, cursor: string | null): Promise<DiscoveryPage> {
    const url = cursor ? this.validateGraphCursor(cursor) : new URL(
      "/v1.0/me/drive/root/delta?$select=id,name,eTag,webUrl,file,image,video,photo,fileSystemInfo,deleted",
      GRAPH_ORIGIN
    );
    const response = await this.graphFetch(url, accessToken);
    const body = await this.readJson<GraphPage>(response);
    if (!Array.isArray(body.value)) {
      throw new ProviderError("OneDrive discovery response did not include items.", "invalid_response");
    }

    const items = body.value
      .filter((item) => !item.deleted && Boolean(item.file) && (Boolean(item.image) || Boolean(item.photo)))
      .map((item) => this.mapItem(item))
      .filter((item) => {
        const date = item.capturedAtUtc?.slice(0, 10);
        return !date || (date >= range.startDate && date <= range.endDate);
      });

    return discoveryPageSchema.parse({
      status: body["@odata.nextLink"] ? "partial" : "complete",
      items,
      nextCursor: body["@odata.nextLink"] ?? null,
      syncCursor: body["@odata.deltaLink"] ?? null,
      warning: "OneDrive capture-date filtering is client-side; UTC calendar dates are used when local EXIF time is unavailable."
    });
  }

  public async fetchPreview(accessToken: string, mediaId: string): Promise<PreviewResult> {
    const safeId = encodeURIComponent(mediaId);
    const response = await this.graphFetch(`/v1.0/me/drive/items/${safeId}/thumbnails/0/large/content`, accessToken);
    const contentLength = response.headers.get("content-length");
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PREVIEW_BYTES)) {
      throw new ProviderError("OneDrive preview exceeded the allowed size.", "invalid_response");
    }
    return {
      bytes: await this.readBoundedBody(response),
      contentType: response.headers.get("content-type") ?? "application/octet-stream"
    };
  }

  public async getOriginalAccess(accessToken: string, mediaId: string): Promise<OriginalAccess> {
    const safeId = encodeURIComponent(mediaId);
    const response = await this.graphFetch(`/v1.0/me/drive/items/${safeId}?$select=webUrl`, accessToken);
    const body = await this.readJson<{ webUrl?: string }>(response);
    if (!body.webUrl) {
      throw new ProviderError("OneDrive item did not include a provider URL.", "invalid_response");
    }
    const url = new URL(body.webUrl);
    if (url.protocol !== "https:") {
      throw new ProviderError("OneDrive returned an unsafe provider URL.", "invalid_response");
    }
    return { type: "provider_url", url: url.toString() };
  }

  private mapItem(item: GraphDriveItem) {
    const capturedAt = item.photo?.takenDateTime ?? item.fileSystemInfo?.createdDateTime ?? null;
    return {
      providerAssetId: item.id,
      mediaKind: item.video ? "video" as const : "image" as const,
      capturedAtUtc: capturedAt,
      capturedAtLocal: null,
      capturedOffsetMinutes: null,
      capturedTimeSource: item.photo?.takenDateTime ? "provider" as const : "file_mtime" as const,
      contentHash: item.file?.hashes?.quickXorHash ?? item.file?.hashes?.sha1Hash ?? null,
      eTag: item.eTag ?? null,
      width: item.image?.width ?? null,
      height: item.image?.height ?? null,
      mimeType: item.file?.mimeType ?? null,
      filename: item.name ?? null,
      providerMetadata: {}
    };
  }

  private async requestToken(parameters: Record<string, string>): Promise<ProviderCredentials> {
    const clientId = this.requireClientId();
    const tokenParameters = new URLSearchParams({
      client_id: clientId,
      scope: GRAPH_SCOPES.join(" "),
      ...parameters
    });
    if (this.options.clientSecret) {
      tokenParameters.set("client_secret", this.options.clientSecret);
    }
    const response = await this.fetchWithTimeout(
      new URL(`/${this.options.tenant}/oauth2/v2.0/token`, LOGIN_ORIGIN), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenParameters
      }
    );
    if (!response.ok) {
      throw new ProviderError("OneDrive authorization failed.", "authorization");
    }
    const body = await this.readJson<TokenResponse>(response);
    if (!body.access_token) {
      throw new ProviderError("OneDrive token response did not include an access token.", "invalid_response");
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1_000) : null,
      scopes: body.scope?.split(" ").filter(Boolean) ?? GRAPH_SCOPES
    };
  }

  private requireClientId(): string {
    if (!this.options.clientId) {
      throw new ProviderError("OneDrive is not configured.", "configuration");
    }
    return this.options.clientId;
  }

  private validateGraphCursor(cursor: string): URL {
    const url = new URL(cursor);
    if (url.origin !== GRAPH_ORIGIN || !url.pathname.startsWith("/v1.0/")) {
      throw new ProviderError("OneDrive returned an invalid discovery cursor.", "invalid_response");
    }
    return url;
  }

  private async graphFetch(input: string | URL, accessToken: string): Promise<Response> {
    const url = typeof input === "string" ? new URL(input, GRAPH_ORIGIN) : input;
    if (url.origin !== GRAPH_ORIGIN) {
      throw new ProviderError("Blocked a non-Graph provider request.", "invalid_response");
    }
    const response = await this.fetchWithTimeout(url, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError("OneDrive authorization is no longer valid.", "authorization");
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      throw new ProviderError("OneDrive rate limit reached.", "rate_limit", retryAfter || null);
    }
    if (!response.ok) {
      throw new ProviderError(`OneDrive request failed with status ${response.status}.`, "upstream");
    }
    return response;
  }

  private async fetchWithTimeout(input: URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(input, {
        ...init,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS)
      });
    } catch (error) {
      this.rethrowNetworkError(error);
    }
  }

  private async readBoundedBody(response: Response): Promise<ArrayBuffer> {
    if (!response.body) {
      throw new ProviderError("OneDrive preview response had no body.", "invalid_response");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    try {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }
          total += chunk.value.byteLength;
          if (total > MAX_PREVIEW_BYTES) {
            await reader.cancel();
            throw new ProviderError("OneDrive preview exceeded the allowed size.", "invalid_response");
          }
          chunks.push(chunk.value);
        }
      } catch (error) {
        this.rethrowNetworkError(error);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch (error) {
      this.rethrowNetworkError(error);
    }
  }

  private rethrowNetworkError(error: unknown): never {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ProviderError("OneDrive request timed out.", "upstream");
    }
    throw error;
  }
}
