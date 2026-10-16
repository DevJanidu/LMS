import { expect, it } from "vitest";
import { describeDevice } from "@/lib/auth/device";
import { dailyShare, draftFrom, notificationsChanged, profileChanged } from "@/components/settings/draft";
import type { User } from "@/types";

it("labels common browsers and systems without guessing unknown ones", () => {
  expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toEqual({ browser: "Chrome", os: "Windows", mobile: false });
  expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toEqual({ browser: "Safari", os: "macOS", mobile: false });
  expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Chrome", os: "iOS", mobile: true });
  expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0")).toMatchObject({ browser: "Edge" });
  expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0")).toEqual({ browser: "Firefox", os: "Linux", mobile: false });
  expect(describeDevice(null)).toEqual({ browser: null, os: null, mobile: false });
});

it("explains a weekly goal per day", () => {
  expect(dailyShare(600)).toEqual({ hours: 1, minutes: 26 });
  expect(dailyShare(0)).toEqual({ hours: 0, minutes: 0 });
  expect(dailyShare(168 * 60)).toEqual({ hours: 24, minutes: 0 });
});

it("detects unsaved profile and reminder changes separately", () => {
  const user = { name: "Nimali", timezone: "Asia/Colombo", timezoneMode: "device", theme: "light", weekStartDay: 1, weeklyTargetMinutes: 600, reminders: true } as User;
  const saved = draftFrom(user, null);
  expect(profileChanged(saved, { ...saved })).toBe(false);
  expect(profileChanged(saved, { ...saved, weekStartDay: 0 })).toBe(true);
  const withReminders = draftFrom(user, { quietStart: "22:00" } as never);
  expect(notificationsChanged(withReminders, { ...withReminders, notifications: { quietStart: "22:00" } as never })).toBe(false);
  expect(notificationsChanged(withReminders, { ...withReminders, notifications: { quietStart: "23:00" } as never })).toBe(true);
});
