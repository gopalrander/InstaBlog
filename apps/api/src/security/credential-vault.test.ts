import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CredentialVault } from "./credential-vault.js";

describe("CredentialVault", () => {
  it("round-trips credentials with a randomized nonce", () => {
    const vault = new CredentialVault("test-key", randomBytes(32));
    const first = vault.encrypt("secret-token", "connection-a");
    const second = vault.encrypt("secret-token", "connection-a");

    expect(first).not.toBe(second);
    expect(vault.decrypt(first, "connection-a")).toBe("secret-token");
    expect(vault.decrypt(second, "connection-a")).toBe("secret-token");
  });

  it("binds ciphertext to the provider connection", () => {
    const vault = new CredentialVault("test-key", randomBytes(32));
    const encrypted = vault.encrypt("secret-token", "connection-a");

    expect(() => vault.decrypt(encrypted, "connection-b")).toThrow();
  });

  it("decrypts credentials written with a previous key", () => {
    const previousKey = randomBytes(32);
    const encrypted = new CredentialVault("key-v1", previousKey).encrypt("secret-token", "connection-a");
    const rotatedVault = new CredentialVault("key-v2", randomBytes(32), { "key-v1": previousKey });

    expect(rotatedVault.decrypt(encrypted, "connection-a")).toBe("secret-token");
  });

  it("rejects ambiguous or unsafe key IDs", () => {
    const key = randomBytes(32);

    expect(() => new CredentialVault("key:v1", key)).toThrow();
    expect(() => new CredentialVault("key-v1", key, { "key-v1": randomBytes(32) })).toThrow();
  });
});
