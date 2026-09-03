import type { ProviderDescriptor } from "@instablog/contracts";
import type { PhotoProvider } from "./types.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, PhotoProvider>();

  public register(provider: PhotoProvider): void {
    if (this.providers.has(provider.type)) {
      throw new Error(`Provider '${provider.type}' is already registered.`);
    }
    this.providers.set(provider.type, provider);
  }

  public get(type: string): PhotoProvider | null {
    return this.providers.get(type) ?? null;
  }

  public require(type: string): PhotoProvider {
    const provider = this.get(type);
    if (!provider) {
      throw Object.assign(new Error("Unknown provider."), { statusCode: 404 });
    }
    if (!provider.isConfigured()) {
      throw Object.assign(new Error("Provider is not configured."), { statusCode: 503 });
    }
    return provider;
  }

  public list(): ProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => ({
      type: provider.type,
      displayName: provider.displayName,
      configured: provider.isConfigured(),
      capabilities: provider.capabilities
    }));
  }
}

