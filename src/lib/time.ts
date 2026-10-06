/** All timestamp presentation goes through the user's timezone. */
export function formatDate(
  instant: string,
  timezone: string,
  locale = "en",
  time = false,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: instant.length === 10 ? "UTC" : timezone,
    month: "short",
    day: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
  }).format(new Date(instant.length === 10 ? `${instant}T12:00:00Z` : instant));
}
export function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function clockTime(seconds: number): string {
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
