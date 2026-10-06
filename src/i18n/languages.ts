import type { Locale } from "./routing";
export interface Language {
  id: Locale;
  name: string;
  shortName: string;
  dir: "ltr" | "rtl";
}
export const languages: Language[] = [
  { id: "en", name: "English", shortName: "English", dir: "ltr" },
  { id: "ar", name: "العربية", shortName: "العربية", dir: "rtl" },
  { id: "es", name: "Español", shortName: "Español", dir: "ltr" },
  { id: "de", name: "Deutsch", shortName: "Deutsch", dir: "ltr" },
];
export function getLanguage(locale: Locale): Language {
  return languages.find((language) => language.id === locale) ?? languages[0];
}
export function isRtl(locale: Locale): boolean {
  return locale === "ar";
}
