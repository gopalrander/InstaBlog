import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPkcePair } from "./oauth.js";

describe("createPkcePair", () => {
  it("creates an S256-compatible verifier and challenge", () => {
    const pair = createPkcePair();
    const expected = createHash("sha256").update(pair.verifier, "ascii").digest("base64url");

    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).toBe(expected);
  });
});

