export class ProviderError extends Error {
  public constructor(
    message: string,
    public readonly kind: "configuration" | "authorization" | "rate_limit" | "upstream" | "invalid_response",
    public readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

