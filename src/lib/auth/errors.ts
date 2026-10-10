export class AuthenticationUnavailable extends Error {
  constructor(cause: unknown) { super("Authentication service unavailable.", { cause }); this.name = "AuthenticationUnavailable"; }
}
/** Classify without logging cookies, SQL parameters, connection URLs or error text. */
export function authenticationFailureKind(error: unknown): string {
  for (let depth = 0; depth < 5 && error && typeof error === "object"; depth++) {
    const value = error as { name?: string; code?: string; cause?: unknown; sourceError?: unknown };
    if (["TimeoutError", "AbortError"].includes(value.name ?? "")) return "timeout";
    if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(value.code ?? "")) return "connection";
    if (["53300", "57P01", "08006", "08001"].includes(value.code ?? "")) return "database";
    error = value.cause ?? value.sourceError;
  }
  return "session_provider";
}
/** Only session verification is retried, once, for recognized transient faults. */
export async function verifySession<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (first) {
    const category = authenticationFailureKind(first);
    if (category !== "session_provider") {
      try {
        const result = await read();
        console.info(JSON.stringify({ event: "authentication_verification_recovered", category }));
        return result;
      } catch (cause) {
        console.warn(JSON.stringify({ event: "authentication_unavailable", category: authenticationFailureKind(cause) }));
        throw new AuthenticationUnavailable(cause);
      }
    }
    console.warn(JSON.stringify({ event: "authentication_unavailable", category }));
    throw new AuthenticationUnavailable(first);
  }
}
