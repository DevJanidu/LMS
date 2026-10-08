/** Reject external/control paths and remove Next's internal prefetch parameter. */
export function safeReturnPath(requested?: string | null): string | undefined {
  if (!requested || !/^\/(dashboard|subjects|study|calendar|analytics|resources|settings|admin|onboarding)(?:\/|\?|$)/.test(requested) || /[\\\u0000-\u001f]/.test(requested)) return undefined;
  const url = new URL(requested, "http://internal.invalid");
  url.searchParams.delete("_rsc");
  return url.pathname + url.search;
}
