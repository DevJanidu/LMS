/** Reset links always point to our public form, never a caller-supplied origin. */
export function passwordResetLink(origin: string, token: string): string {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("token", token);
  return url.href;
}
