import type { LeaderboardRow } from "./LeaderboardTable";

/** Shapes returned by /api/circles (see src/lib/circles/leaderboard.ts). */
export interface FeedItem { id: string; userId: string; name: string; image: string | null; me: boolean; kind: "session" | "streak" | "weeklyHours" | "groupWin" | "achievement"; value: number; subject: string | null; group: string | null; createdAt: string }
export interface Record { weeks: { week: string; seconds: number; sessions: number }[]; bestWeek: { week: string; seconds: number } | null; groupWins: number; achievements: { key: string; earnedAt: string }[] }
export interface Overview { week: string; me: LeaderboardRow; top: LeaderboardRow[]; participants: number; incomingRequests: number; groupInvitations: number; groups: number; feed: FeedItem[]; record: Record }
export interface Friend { id: string; name: string; image: string | null; weekSeconds: number | null; rank: number | null; streak: number | null; lastActivityAt: string | null }
export interface Requests {
  incoming: { id: string; name: string; image: string | null; createdAt: string }[];
  outgoing: { id: string; maskedEmail: string; createdAt: string }[];
  groupInvitations: { id: string; groupName: string; inviterName: string; createdAt: string }[];
}
export interface GroupSummary { id: string; name: string; description: string; color: string; role: "owner" | "admin" | "member"; members: number }
export interface GroupBoard {
  group: { id: string; name: string; description: string; color: string; myRole: "owner" | "admin" | "member" };
  week: string; finalized: boolean; totalSeconds: number;
  rows: (LeaderboardRow & { role: string })[];
  previousWinners: { userId: string; name: string; seconds: number }[];
  invitations: { id: string; name: string; createdAt: string }[];
}
export interface GroupWeek { week: string; totalSeconds: number; winners: { name: string; seconds: number }[]; myRank: number | null; members: number; corrected: boolean }
export interface History {
  week: string; totalCreditedSeconds: number;
  sessions: { subject: string | null; startedAt: string; endedAt: string; activeSeconds: number; creditedSeconds: number; excludedSeconds: number; pausedSeconds: number; reasons: string[]; invalidated: boolean; day: string }[];
  manual: { id: string; subject: string; startedAt: string; endedAt: string; seconds: number }[];
}
export interface Privacy { acceptRequests: boolean; activityVisibility: "private" | "friends" | "groups"; shareSubjects: boolean; shareStreak: boolean; showOnLeaderboards: boolean }
export interface Rules { timezone: string; sessionCapSeconds: number; dailyCapSeconds: number; graceSeconds: number }
