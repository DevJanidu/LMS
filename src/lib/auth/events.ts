/**
 * Structured authentication events for the platform log stream. Only an
 * allowlisted set of identifiers is written: never tokens, cookies, codes,
 * verifiers, secrets, emails or provider messages.
 */
export type AuthEventName =
  | "auth.sign_in" | "auth.sign_in_failed" | "auth.sign_out"
  | "auth.account_linked" | "auth.account_link_rejected"
  | "auth.session_revoked" | "auth.session_expired" | "auth.suspicious";

interface AuthEventFields { userId?: string; role?: string; reason?: string; count?: number; scope?: "current" | "others" | "all" }
const SUSPICIOUS = /state|nonce|issuer|invalid_code|callback_request|ALREADY_LINKED|NOT_AUTHORIZED/i;

/** Reduce an error code to a short identifier; anything else becomes `other`. */
export const safeReason = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : "other";

export function authEvent(event: AuthEventName, fields: AuthEventFields = {}) {
  const record: Record<string, string | number> = { event, at: new Date().toISOString() };
  if (fields.userId && /^[0-9a-f-]{36}$/i.test(fields.userId)) record.userId = fields.userId;
  if (fields.role === "learner" || fields.role === "super_admin") record.role = fields.role;
  if (fields.reason !== undefined) record.reason = safeReason(fields.reason);
  if (typeof fields.count === "number" && Number.isFinite(fields.count)) record.count = fields.count;
  if (fields.scope) record.scope = fields.scope;
  const warn = event === "auth.suspicious" || event === "auth.account_link_rejected" || (event === "auth.sign_in_failed" && SUSPICIOUS.test(String(record.reason)));
  (warn ? console.warn : console.info)(JSON.stringify(record));
  if (event === "auth.sign_in_failed" && SUSPICIOUS.test(String(record.reason))) console.warn(JSON.stringify({ ...record, event: "auth.suspicious" }));
}

/** Better Auth's logger, reduced to level and a truncated message; arguments may hold provider responses and are dropped. */
export function libraryLog(level: string, message: string) {
  const text = String(message ?? "").replace(/[\r\n]+/g, " ").slice(0, 160);
  console.warn(JSON.stringify({ event: "auth.library", level, message: text }));
}
