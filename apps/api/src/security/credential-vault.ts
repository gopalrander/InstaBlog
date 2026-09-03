import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export class CredentialVault {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(
    private readonly activeKeyId: string,
    activeKey: Buffer,
    previousKeys: Readonly<Record<string, Buffer>> = {}
  ) {
    if (!/^[A-Za-z0-9._-]+$/.test(activeKeyId) || Object.keys(previousKeys).some((keyId) => !/^[A-Za-z0-9._-]+$/.test(keyId))) {
      throw new Error("Credential encryption key IDs contain unsupported characters.");
    }
    if (Object.hasOwn(previousKeys, activeKeyId)) {
      throw new Error("Previous credential keys must not redefine the active key ID.");
    }
    this.keys = new Map([...Object.entries(previousKeys), [activeKeyId, activeKey]]);
    for (const key of this.keys.values()) {
      if (key.length !== 32) {
        throw new Error("Credential encryption keys must be 32 bytes.");
      }
    }
  }

  public encrypt(plaintext: string, connectionId: string): string {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.keys.get(this.activeKeyId)!, nonce);
    cipher.setAAD(Buffer.from(connectionId, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const payload = Buffer.concat([ciphertext, cipher.getAuthTag()]);
    return [VERSION, this.activeKeyId, nonce.toString("base64url"), payload.toString("base64url")].join(":");
  }

  public decrypt(envelope: string, connectionId: string): string {
    const [version, keyId, encodedNonce, encodedPayload, extra] = envelope.split(":");
    if (version !== VERSION || !keyId || !encodedNonce || !encodedPayload || extra !== undefined) {
      throw new Error("Unsupported credential envelope.");
    }
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error("Unknown credential encryption key.");
    }

    const nonce = Buffer.from(encodedNonce, "base64url");
    const payload = Buffer.from(encodedPayload, "base64url");
    if (nonce.length !== NONCE_BYTES || payload.length <= TAG_BYTES) {
      throw new Error("Invalid credential envelope.");
    }

    const ciphertext = payload.subarray(0, -TAG_BYTES);
    const tag = payload.subarray(-TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAAD(Buffer.from(connectionId, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
