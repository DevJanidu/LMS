import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    try {
      const { getEnv } = await import("@/lib/env");
      getEnv();
    } catch (error) {
      const fields = (error as { fields?: unknown })?.fields;
      console.error(JSON.stringify({
        event: "startup_configuration_invalid",
        fields: Array.isArray(fields) ? fields.filter(field => typeof field === "string" && /^[A-Z][A-Z0-9_]*$/.test(field)) : [],
      }));
      // Keep public recovery pages available. getEnv() still rejects invalid
      // configuration at every protected service entry point; health returns 503.
    }
  }
}

/** Request metadata, error text and stacks may contain private data: omit them. */
export const onRequestError: Instrumentation.onRequestError = (_error, _request, context) => {
  console.error(JSON.stringify({ event: "server_request_failed", routeType: context.routeType, router: context.routerKind }));
};
