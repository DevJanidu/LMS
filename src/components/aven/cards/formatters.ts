export interface ZonedFormatters {
  dateTime: (iso: string) => string;
  day: (iso: string) => string;
  time: (iso: string) => string;
}
export function zonedFormatters(timezone: string): ZonedFormatters {
  const format = (options: Intl.DateTimeFormatOptions) => {
    const formatter = new Intl.DateTimeFormat("en", {
      ...options,
      timeZone: timezone,
    });
    return (iso: string) => formatter.format(new Date(iso));
  };
  return {
    dateTime: format({ dateStyle: "medium", timeStyle: "short" }),
    day: format({ weekday: "short", month: "short", day: "numeric" }),
    time: format({ hour: "numeric", minute: "2-digit" }),
  };
}
/** Calendar dates (YYYY-MM-DD) are wall dates, so format them in UTC to avoid shifting a day. */
export const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
