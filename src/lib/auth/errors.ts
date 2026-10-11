export class AuthenticationUnavailable extends Error {
  constructor(cause: unknown) { super("Authentication service unavailable.", { cause }); this.name = "AuthenticationUnavailable"; }
}
/** Map only documented provider codes; never expose provider messages to the browser. */
export function authFeedback(error: unknown): { error: string; field?: "email" | "password" } {
  const value = error as { body?: { code?: string }; name?: string; statusCode?: number; fields?: string[] } | null;
  switch (value?.body?.code) {
    case "INVALID_EMAIL": return { error: "invalidEmail", field: "email" };
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD": return { error: "invalidCredentials" };
    case "PASSWORD_TOO_SHORT": return { error: "passwordTooShort", field: "password" };
    case "PASSWORD_TOO_LONG": return { error: "passwordTooLong", field: "password" };
    case "INVALID_TOKEN": return { error: "invalidResetLink" };
    case "EMAIL_NOT_VERIFIED": return { error: "emailNotVerified" };
    case "ACCOUNT_INACTIVE": return { error: "accountInactive" };
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL": return { error: "emailAlreadyRegistered", field: "email" };
  }
  if (value?.name === "AccountEmailUnavailable") return { error: "emailDeliveryFailed" };
  if (value?.name === "InvalidServerConfiguration" && value.fields?.some(field => ["EMAIL_FROM", "RESEND_API_KEY"].includes(field))) return { error: "emailUnavailable" };
  return { error: "authenticationUnavailable" };
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
