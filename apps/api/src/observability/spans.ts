import { SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("instablog.providers");

export async function withProviderSpan<T>(
  operation: string,
  provider: string,
  execute: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`provider.${operation}`, {
    attributes: {
      "instablog.provider.type": provider
    }
  }, async (span) => {
    try {
      const result = await execute();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Provider operation failed"
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

