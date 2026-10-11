export function providerErrorCode(status: number, code?: string) {
  if (status === 401) return "aiKeyInvalid";
  if (status === 403) return "aiAccessDenied";
  if (status === 404) return "aiModelUnavailable";
  if (status === 429)
    return code === "insufficient_quota" ? "aiQuotaExceeded" : "aiRateLimited";
  if (status === 400 || status === 422) return "aiRequestInvalid";
  return "aiUnavailable";
}

/** Never surface upstream messages: they can contain request contents or credentials. */
export async function readProviderFailure(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string };
  } | null;
  const code =
    typeof body?.error?.code === "string" ? body.error.code : undefined;
  return providerErrorCode(response.status, code);
}
