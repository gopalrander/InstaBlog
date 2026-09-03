import type {
  DateRange,
  DiscoveryPage,
  ProviderCapabilities,
  ProviderMedia
} from "@instablog/contracts";

export interface ProviderCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

export interface ProviderAccount {
  providerUserId: string;
}

export interface AuthorizationRequest {
  state: string;
  codeChallenge: string;
}

export interface AuthorizationCode {
  code: string;
  codeVerifier: string;
}

export interface PreviewResult {
  bytes: ArrayBuffer;
  contentType: string;
}

export interface OriginalAccess {
  type: "provider_url";
  url: string;
}

export interface PhotoProvider {
  readonly type: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  isConfigured(): boolean;
  authorizationUrl(request: AuthorizationRequest): URL;
  exchangeCode(request: AuthorizationCode): Promise<ProviderCredentials>;
  refreshCredentials(refreshToken: string): Promise<ProviderCredentials>;
  getAccount(accessToken: string): Promise<ProviderAccount>;
  discoverMedia(accessToken: string, range: DateRange, cursor: string | null): Promise<DiscoveryPage>;
  fetchPreview(accessToken: string, mediaId: string): Promise<PreviewResult>;
  getOriginalAccess(accessToken: string, mediaId: string): Promise<OriginalAccess>;
}

export type { DateRange, DiscoveryPage, ProviderCapabilities, ProviderMedia };

