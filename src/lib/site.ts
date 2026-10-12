/** Canonical public origin for metadata, sitemap and structured data. */
export const SITE_URL = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "https://acadence.janidudev.com")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\/+$/, "");
