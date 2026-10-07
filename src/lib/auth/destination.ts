/** Only known application paths may be used after authentication. */
export function loginDestination(role: string, onboarded: boolean, requested?: string): string {
  if (role === "super_admin") return "/admin";
  if (!onboarded) return "/onboarding";
  if (requested && /^\/(dashboard|subjects|study|calendar|analytics|resources|settings)(?:\/|\?|$)/.test(requested) && !/[\\\u0000-\u001f]/.test(requested)) {
    return requested;
  }
  return "/dashboard";
}
