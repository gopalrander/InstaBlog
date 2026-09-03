import { describe, expect, it } from "vitest";
import { FakePhotoProvider } from "./provider.js";

const provider = new FakePhotoProvider({
  apiOrigin: "http://localhost:3001",
  enabled: true
});

describe("FakePhotoProvider", () => {
  it("paginates synthetic media through the normal provider contract", async () => {
    const range = {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      timezone: "UTC"
    };
    const first = await provider.discoverMedia("fake-access-token", range, null);
    const second = await provider.discoverMedia("fake-access-token", range, first.nextCursor);

    expect(first.status).toBe("partial");
    expect(first.items).toHaveLength(3);
    expect(second.status).toBe("complete");
    expect(second.items).toHaveLength(3);
  });

  it("serves deterministic local preview content", async () => {
    const preview = await provider.fetchPreview("fake-access-token", "venice-sunset");

    expect(preview.contentType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(preview.bytes)).toContain("Venice sunset");
  });
});

