import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getGreeting, greetingForDate, greetingName, type GreetingPeriod } from "../src/lib/greeting";

const expectedImages: Record<GreetingPeriod, string> = {
  morning: "/images/morning.webp",
  afternoon: "/images/afternoon.webp",
  evening: "/images/evening.webp",
  night: "/images/night.webp",
  midnight: "/images/midnight.webp",
};

const expectedCopy: Record<GreetingPeriod, ReturnType<typeof getGreeting>> = {
  morning: { greeting: "Good morning, Alex ☀️", tagline: "Hope your day starts well.", badge: "🐦 Early Bird" },
  afternoon: { greeting: "Good afternoon, Alex 🌤️", tagline: "Keep up the great work.", badge: "🌤️ Day Champion" },
  evening: { greeting: "Good evening, Alex 🌆", tagline: "Time to slow down a little.", badge: "⭐ Evening Star" },
  night: { greeting: "Good night, Alex 🌙", tagline: "Winding down? Rest well.", badge: "🌙 Night Voyager" },
  midnight: { greeting: "Still up, Alex? 🦉", tagline: "The night owls are out tonight.", badge: "🦉 Night Owl" },
};

const boundaries: Array<[number, number, GreetingPeriod]> = [
  [4, 59, "midnight"], [5, 0, "morning"], [11, 59, "morning"],
  [12, 0, "afternoon"], [16, 59, "afternoon"], [17, 0, "evening"],
  [20, 59, "evening"], [21, 0, "night"], [23, 59, "night"], [0, 0, "midnight"],
];

const zones = [
  ["Asia/Colombo", 330, 330],
  ["America/New_York", -300, -240],
  ["Europe/London", 0, 60],
  ["Asia/Tokyo", 540, 540],
  ["Australia/Sydney", 660, 600],
  ["Asia/Kathmandu", 345, 345],
] as const;

describe("local greeting period and image", () => {
  for (const [zone, winterOffset, summerOffset] of zones) {
    for (const [month, offset] of [[0, winterOffset], [6, summerOffset]] as const) {
      it.each(boundaries)(`${zone} in month ${month + 1}: %i:%i is %s`, (hour, minute, expected) => {
        const instant = new Date(Date.UTC(2026, month, 15, hour, minute) - offset * 60_000);
        const previous = process.env.TZ;
        try {
          process.env.TZ = zone;
          const result = greetingForDate(instant);
          expect(result.period).toBe(expected);
          expect(result.image.src).toBe(expectedImages[expected]);
          expect(existsSync(join(process.cwd(), "public", result.image.src.slice(1)))).toBe(true);
          expect(getGreeting("Alex", instant)).toEqual(expectedCopy[expected]);
        } finally {
          if (previous === undefined) delete process.env.TZ;
          else process.env.TZ = previous;
        }
      });
    }
  }

  it("uses friend when the account name is empty", () => {
    expect(greetingName("  ")).toBe("friend");
    expect(greetingName("  Alex Morgan  ")).toBe("Alex Morgan");
    expect(getGreeting(" ", new Date(2026, 0, 15, 12))).toEqual({
      greeting: "Good afternoon, friend 🌤️",
      tagline: "Keep up the great work.",
      badge: "🌤️ Day Champion",
    });
  });
});
