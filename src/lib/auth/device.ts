/** A readable device label from a stored user agent; unknown parts stay unknown. */
export interface DeviceSummary { browser: string | null; os: string | null; mobile: boolean }

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"], [/OPR\/|Opera/, "Opera"], [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"], [/Chrome\/|CriOS\//, "Chrome"], [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"], [/Android/, "Android"], [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"], [/Mac OS X|Macintosh/, "macOS"], [/Linux/, "Linux"],
];

export function describeDevice(userAgent: string | null | undefined): DeviceSummary {
  const agent = userAgent ?? "";
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(agent))?.[1] ?? null,
    os: SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1] ?? null,
    mobile: /Mobi|iPhone|iPod|Android(?!.*Tablet)/.test(agent),
  };
}
