import { createHash } from "node:crypto";

/**
 * Applies the saved theme before first paint. It is the only first-party inline
 * script; strict policies allow it by hash, so the text must stay byte-identical.
 */
export const THEME_SCRIPT = `(function(){var m=document.cookie.match(/(?:^|; )sf-theme=(dark|light|auto)(?:;|$)/);var v=m?m[1]:'light';var d=v==='dark'||(v==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.setAttribute('data-color-scheme',d?'dark':'light')})()`;
export const THEME_SCRIPT_HASH = `'sha256-${createHash("sha256").update(THEME_SCRIPT).digest("base64")}'`;

interface PolicyOptions { nonce?: string; storageOrigin?: string; development?: boolean }
/**
 * With a nonce, inline scripts run only when Next.js marked them with that nonce
 * (or they are the hashed theme script). Without one (statically rendered marketing
 * pages, which carry no per-request data) inline scripts remain allowed.
 */
export function contentSecurityPolicy({ nonce, storageOrigin = "", development = false }: PolicyOptions) {
  const scripts = nonce ? `'self' 'nonce-${nonce}' ${THEME_SCRIPT_HASH}` : "'self' 'unsafe-inline'";
  return [
    "default-src 'self'",
    `script-src ${scripts}${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Google profile photos (account avatars) and YouTube thumbnails.
    "img-src 'self' data: https://i.ytimg.com https://lh3.googleusercontent.com",
    "font-src 'self'",
    `connect-src 'self'${storageOrigin ? ` ${storageOrigin}` : ""}${development ? " ws: wss:" : ""}`,
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
}

export function storageOriginFrom(endpoint: string | undefined) {
  if (!endpoint) return "";
  try { return new URL(endpoint).origin; }
  catch { throw new Error("Invalid OBJECT_STORAGE_ENDPOINT configuration."); }
}
