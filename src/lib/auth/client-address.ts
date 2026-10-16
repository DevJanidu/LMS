import { isIP } from "node:net";

/**
 * Client address for rate limiting. Forwarding headers are trusted only on
 * Vercel, whose edge overwrites them; elsewhere a client could rotate them to
 * dodge limits, so every request shares one "direct" bucket instead.
 */
export function clientAddress(request: Request, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL !== "1") return "direct";
  for (const name of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const value = request.headers.get(name)?.split(",")[0]?.trim();
    if (value && isIP(value)) return value;
  }
  return "unknown";
}
