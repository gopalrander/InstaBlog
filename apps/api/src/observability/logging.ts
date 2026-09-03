import type { FastifyRequest } from "fastify";

export function sanitizeRequestPath(url: string): string {
  return url.split("?", 1)[0] ?? url;
}

export function serializeRequest(request: FastifyRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: sanitizeRequestPath(request.url),
    host: request.headers.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort
  };
}
