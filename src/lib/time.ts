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
/** "45m", "2h", "1h 5m": reads naturally inside sentences and compact tables. */
export function compactDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
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
