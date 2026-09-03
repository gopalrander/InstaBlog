import { describe, expect, it, vi } from "vitest";
import { OneDriveProvider } from "./provider.js";

const options = {
  clientId: "client-id",
  tenant: "common",
  redirectUri: "http://localhost:3001/providers/onedrive/callback"
};

describe("OneDriveProvider", () => {
  it("builds an authorization URL with PKCE and minimal delegated scopes", () => {
    const provider = new OneDriveProvider(options);
    const url = provider.authorizationUrl({ state: "state", codeChallenge: "challenge" });

    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("Files.Read");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });

  it("maps and filters paginated photo results", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      value: [
        {
          id: "photo-1",
          name: "rome.jpg",
          eTag: "etag",
          file: { mimeType: "image/jpeg", hashes: { quickXorHash: "hash" } },
          image: { width: 1200, height: 800 },
          photo: { takenDateTime: "2026-07-05T12:30:00Z" }
        },
        {
          id: "outside",
          file: { mimeType: "image/jpeg" },
          image: {},
          photo: { takenDateTime: "2026-08-05T12:30:00Z" }
        }
      ],
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/drive/root/delta?$skiptoken=next"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new OneDriveProvider(options, fetcher);

    const page = await provider.discoverMedia("token", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      timezone: "America/Los_Angeles"
    }, null);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      providerAssetId: "photo-1",
      contentHash: "hash",
      capturedTimeSource: "provider"
    });
    expect(page.nextCursor).toContain("$skiptoken=next");
    expect(page.syncCursor).toBeNull();
  });

  it("rejects discovery cursors outside Microsoft Graph", async () => {
    const provider = new OneDriveProvider(options);

    await expect(provider.discoverMedia("token", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      timezone: "UTC"
    }, "https://attacker.example/items")).rejects.toThrow("invalid discovery cursor");
  });

  it("rejects oversized streamed previews before buffering the full response", async () => {
    const oversizedChunk = new Uint8Array(10 * 1024 * 1024 + 1);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(oversizedChunk);
          controller.close();
        }
      }),
      { status: 200, headers: { "content-type": "image/jpeg" } }
    ));
    const provider = new OneDriveProvider(options, fetcher);

    await expect(provider.fetchPreview("token", "photo-1")).rejects.toThrow("exceeded");
  });

  it("normalizes response body timeouts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new DOMException("Timed out", "TimeoutError"));
        }
      }),
      { status: 200 }
    ));
    const provider = new OneDriveProvider(options, fetcher);

    await expect(provider.fetchPreview("token", "photo-1")).rejects.toMatchObject({
      name: "ProviderError",
      kind: "upstream"
    });
  });
});
