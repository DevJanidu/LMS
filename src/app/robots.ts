import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Index the public site only; the authenticated workspace stays out of search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/register", "/login", "/privacy", "/terms"],
      disallow: ["/api/", "/dashboard", "/subjects", "/study", "/calendar", "/analytics", "/resources", "/goals", "/aven", "/settings", "/billing", "/admin", "/onboarding"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
