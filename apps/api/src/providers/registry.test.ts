import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "./registry.js";
import type { PhotoProvider } from "./types.js";

function fakeProvider(type = "fake"): PhotoProvider {
  return {
    type,
    displayName: "Fake",
    capabilities: {
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
    },
    isConfigured: () => true,
    authorizationUrl: () => new URL("https://example.test/authorize"),
    exchangeCode: async () => ({ accessToken: "token", refreshToken: null, expiresAt: null, scopes: [] }),
    refreshCredentials: async () => ({ accessToken: "token", refreshToken: null, expiresAt: null, scopes: [] }),
    getAccount: async () => ({ providerUserId: "user" }),
    discoverMedia: async () => ({
      status: "complete",
      items: [],
      nextCursor: null,
      syncCursor: null,
      warning: null
    }),
    fetchPreview: async () => ({ bytes: new ArrayBuffer(0), contentType: "image/jpeg" }),
    getOriginalAccess: async () => ({ type: "provider_url", url: "https://example.test/item" })
  };
}

describe("ProviderRegistry", () => {
  it("lists providers through transport-safe descriptors", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider());

    expect(registry.list()).toEqual([
      expect.objectContaining({ type: "fake", displayName: "Fake", configured: true })
    ]);
  });

  it("rejects duplicate provider types", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider());

    expect(() => registry.register(fakeProvider())).toThrow("already registered");
  });
});
