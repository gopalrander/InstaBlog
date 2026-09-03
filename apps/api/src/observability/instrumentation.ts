import { FastifyOtelInstrumentation } from "@fastify/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { loadEnvironment } from "../config/env.js";

const environment = loadEnvironment();

const sdk = environment.OTEL_TRACES_EXPORTER === "otlp"
  ? new NodeSDK({
      serviceName: environment.OTEL_SERVICE_NAME,
      traceExporter: new OTLPTraceExporter({
        url: environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
      }),
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) => request.url?.split("?", 1)[0] === "/health",
          requestHook: (span, request) => {
            if ("url" in request && request.url) {
              span.setAttribute("url.path", request.url.split("?", 1)[0] ?? request.url);
              span.setAttribute("url.query", "[REDACTED]");
            }
          },
          redactedQueryParams: [
            "code",
            "state",
            "code_challenge",
            "code_verifier",
            "$skiptoken",
            "token",
            "sig",
            "Signature",
            "AWSAccessKeyId",
            "X-Goog-Signature"
          ]
        }),
        new UndiciInstrumentation({
          requestHook: (span, request) => {
            span.setAttribute("url.full", `${request.origin}${request.path.split("?", 1)[0]}`);
            span.setAttribute("url.query", "[REDACTED]");
          }
        }),
        new FastifyOtelInstrumentation({
          registerOnInitialization: true,
          instrumentHooks: false,
          ignorePaths: (request) => request.url === "/health",
          requestHook: (span, request) => {
            span.setAttribute("url.path", request.url.split("?", 1)[0] ?? request.url);
            span.setAttribute("url.query", "[REDACTED]");
          }
        })
      ]
    })
  : null;

sdk?.start();

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
