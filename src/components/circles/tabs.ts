/** Study Circles tabs. Kept outside the client component so server pages can read the list. */
export const CIRCLE_TABS = ["overview", "friends", "groups", "leaderboard", "history", "privacy"] as const;
export type CircleTab = (typeof CIRCLE_TABS)[number];
