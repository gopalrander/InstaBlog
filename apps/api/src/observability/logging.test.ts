import { describe, expect, it } from "vitest";
import { sanitizeRequestPath } from "./logging.js";

describe("sanitizeRequestPath", () => {
  it("removes query parameters from structured request logs", () => {
    const serialized = sanitizeRequestPath(
      "/providers/fake/callback?code=secret&state=sensitive"
    );

    expect(serialized).toBe("/providers/fake/callback");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("sensitive");
  });
});
