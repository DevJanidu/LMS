import type { NotificationPreferences } from "@/lib/aven/validation";
import type { User } from "@/types";

/** Everything the floating save bar saves together. */
export interface SettingsDraft {
  name: string;
  timezoneMode: "device" | "manual";
  /** Chosen zone while `timezoneMode` is manual. */
  timezone: string;
  theme: User["theme"];
  weekStartDay: 0 | 1;
  weeklyTargetMinutes: number;
  reminders: boolean;
  /** Aven study reminders; null when that service could not be loaded. */
  notifications: NotificationPreferences | null;
}
export type DraftChange = (patch: Partial<SettingsDraft>) => void;

export const draftFrom = (user: User, notifications: NotificationPreferences | null): SettingsDraft => ({
  name: user.name, timezoneMode: user.timezoneMode ?? "device", timezone: user.timezone, theme: user.theme,
  weekStartDay: user.weekStartDay, weeklyTargetMinutes: user.weeklyTargetMinutes, reminders: user.reminders, notifications,
});

const profileKeys = ["name", "timezoneMode", "timezone", "theme", "weekStartDay", "weeklyTargetMinutes", "reminders"] as const;
export const profileChanged = (a: SettingsDraft, b: SettingsDraft) => profileKeys.some(key => a[key] !== b[key]);
export const notificationsChanged = (a: SettingsDraft, b: SettingsDraft) => JSON.stringify(a.notifications) !== JSON.stringify(b.notifications);

/** "About 1h 26m a day" style breakdown of a weekly goal. */
export function dailyShare(weeklyMinutes: number) {
  const daily = Math.round(weeklyMinutes / 7);
  return { hours: Math.floor(daily / 60), minutes: daily % 60 };
}
