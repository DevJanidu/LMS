export function validTimezone(value: string): boolean {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
export function deviceTimezone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimezone(zone) ? zone : undefined;
  } catch {
    return undefined;
  }
}
export function timezoneOptions(current?: string): string[] {
  let values: string[] = [];
  try {
    values = Intl.supportedValuesOf("timeZone");
  } catch {}
  return [
    ...new Set([
      "UTC",
      ...(current && validTimezone(current) ? [current] : []),
      ...values,
    ]),
  ];
}
