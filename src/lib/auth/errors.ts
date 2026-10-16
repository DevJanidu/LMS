export class AuthenticationUnavailable extends Error {
  constructor(cause: unknown) { super("Authentication service unavailable.", { cause }); this.name = "AuthenticationUnavailable"; }
}
/** Map only documented provider codes; never expose provider messages to the browser. */
export function authFeedback(error: unknown): { error: string } {
  const value = error as { body?: { code?: string } } | null;
  if (value?.body?.code === "ACCOUNT_INACTIVE") return { error: "accountInactive" };
  return { error: "authenticationUnavailable" };
}
/** Map OAuth redirect error codes (`/login?error=…`) to translated messages. */
export function signInErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (/account[_ ]?inactive|account[_ ]unavailable/i.test(code)) return "accountInactive";
  if (code === "agePolicy") return "agePolicy";
  if (code === "EMAIL_NOT_VERIFIED" || code === "account_not_linked") return "emailNotVerified";
  if (code === "ADMIN_LINK_NOT_AUTHORIZED") return "adminLinkNotAuthorized";
  if (code === "GOOGLE_IDENTITY_ALREADY_LINKED") return "googleIdentityConflict";
  return "googleSignInFailed";
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
