export type GreetingPeriod = "morning" | "afternoon" | "evening" | "night" | "midnight";

export const greetingImages: Record<GreetingPeriod, { src: string; alt: string }> = {
  morning: { src: "/images/morning.webp", alt: "Sunrise over misty hills" },
  afternoon: { src: "/images/afternoon.webp", alt: "Sun shining over hills in the afternoon" },
  evening: { src: "/images/evening.webp", alt: "Sunset over hills and water" },
  night: { src: "/images/night.webp", alt: "Moon and stars over hills at night" },
  midnight: { src: "/images/midnight.webp", alt: "Owl beneath a moonlit, starry midnight sky" },
};

export function greetingPeriodForHour(hour: number): GreetingPeriod {
  if (hour < 5) return "midnight";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function greetingName(name: string): string {
  return name?.trim().split(/\s+/)[0] || "friend";
}

/** Date#getHours reads the browser device's local time zone. */
export function greetingForDate(date: Date) {
  const period = greetingPeriodForHour(date.getHours());
  return { period, image: greetingImages[period] };
}

export function getGreeting(name: string, date = new Date()) {
  const cleanName = greetingName(name);
  const period = greetingForDate(date).period;
  switch (period) {
    case "morning": return { greeting: `Good morning, ${cleanName}`, tagline: "Hope your day starts well.", badge: "Early Bird" };
    case "afternoon": return { greeting: `Good afternoon, ${cleanName}`, tagline: "Keep up the great work.", badge: "Day Champion" };
    case "evening": return { greeting: `Good evening, ${cleanName}`, tagline: "Time to slow down a little.", badge: "Evening Star" };
    case "night": return { greeting: `Good night, ${cleanName}`, tagline: "Winding down? Rest well.", badge: "Night Voyager" };
    case "midnight": return { greeting: `Still up, ${cleanName}?`, tagline: "The night owls are out tonight.", badge: "Night Owl" };
  }
}
