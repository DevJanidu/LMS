import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { getEnv } = await import("@/lib/env");
    getEnv();
  }
}

/** Request metadata, error text and stacks may contain private data: omit them. */
export const onRequestError: Instrumentation.onRequestError = (_error, _request, context) => {
  console.error(JSON.stringify({ event: "server_request_failed", routeType: context.routeType, router: context.routerKind }));
};
