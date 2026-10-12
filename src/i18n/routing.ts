import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "never",
  localeDetection: false,
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
