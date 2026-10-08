import { safeReturnPath } from "./return-path";
/** Only known application paths may be used after authentication. */
export function loginDestination(role: string, onboarded: boolean, requested?: string): string {
  const path = safeReturnPath(requested);
  if (role === "super_admin") return path && /^\/admin(?:\/|\?|$)/.test(path) ? path : "/admin";
  if (!onboarded) return "/onboarding";
  if (path && /^\/(dashboard|subjects|study|calendar|analytics|resources|settings)(?:\/|\?|$)/.test(path)) {
    return path;
  }
  return "/dashboard";
}
