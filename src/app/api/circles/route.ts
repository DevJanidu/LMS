import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { featureFailure, learnerAccount, privateJson, validatedBody } from "@/lib/goals/http";
import { GoalError } from "@/lib/goals/service";
import { requestLimit } from "@/lib/rate-limit";
import {
  activityFeed, competitionRecord, friendHistory, friendsLeaderboard, friendsList, groupHistory, groupLeaderboard,
  invitableFriends, overview, requests, studyHistory,
} from "@/lib/circles/leaderboard";
import {
  blockUser, cancelInvitation, createGroup, deleteGroup, inviteToGroup, leaveGroup, manageMember, myGroups, privacyOf,
  removeFriend, respondToGroupInvitation, respondToRequest, sendFriendRequest, unblockUser, updateGroup, updatePrivacy,
} from "@/lib/circles/social";
import { COMPETITION_TIMEZONE, DAILY_CREDIT_CAP_SECONDS, HEARTBEAT_GRACE_SECONDS, SESSION_CREDIT_CAP_SECONDS } from "@/lib/circles/policy";

const id = z.uuid();
const week = z.iso.date().refine(value => new Date(`${value}T12:00:00Z`).getUTCDay() === 1, "Weeks start on Monday").optional();
const query = z.discriminatedUnion("view", [
  z.object({ view: z.literal("overview") }),
  z.object({ view: z.literal("friends") }),
  z.object({ view: z.literal("requests") }),
  z.object({ view: z.literal("feed") }),
  z.object({ view: z.literal("groups") }),
  z.object({ view: z.literal("group"), id, week }),
  z.object({ view: z.literal("groupHistory"), id }),
  z.object({ view: z.literal("invitable"), id }),
  z.object({ view: z.literal("leaderboard"), week }),
  z.object({ view: z.literal("history"), week }),
  z.object({ view: z.literal("friendHistory"), id, week }),
  z.object({ view: z.literal("record") }),
  z.object({ view: z.literal("privacy") }),
]);
const groupFields = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(280).default(""), color: z.enum(["brand", "success", "orange", "purple"]).default("brand") });
const mutation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sendRequest"), email: z.email().max(254) }),
  z.object({ kind: z.literal("respondRequest"), id, action: z.enum(["accept", "decline", "block"]) }),
  z.object({ kind: z.literal("cancelInvitation"), id }),
  z.object({ kind: z.literal("removeFriend"), id }),
  z.object({ kind: z.literal("block"), id }),
  z.object({ kind: z.literal("unblock"), id }),
  z.object({ kind: z.literal("createGroup"), value: groupFields }),
  z.object({ kind: z.literal("updateGroup"), id, value: groupFields }),
  z.object({ kind: z.literal("deleteGroup"), id }),
  z.object({ kind: z.literal("inviteToGroup"), id, userIds: z.array(id).min(1).max(50) }),
  z.object({ kind: z.literal("respondGroupInvitation"), id, action: z.enum(["accept", "decline"]) }),
  z.object({ kind: z.literal("leaveGroup"), id }),
  z.object({ kind: z.literal("manageMember"), id, memberId: id, action: z.enum(["remove", "makeAdmin", "makeMember", "transferOwnership"]) }),
  z.object({ kind: z.literal("privacy"), value: z.object({ acceptRequests: z.boolean(), activityVisibility: z.enum(["private", "friends", "groups"]), shareSubjects: z.boolean(), shareStreak: z.boolean(), showOnLeaderboards: z.boolean() }) }),
]);

export async function GET(request: Request) {
  try {
    const user = await learnerAccount();
    const input = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = input.view === "overview" ? await overview(user.id)
      : input.view === "friends" ? { friends: await friendsList(user.id) }
      : input.view === "requests" ? await requests(user.id)
      : input.view === "feed" ? { feed: await activityFeed(user.id, 40) }
      : input.view === "groups" ? { groups: await myGroups(user.id) }
      : input.view === "group" ? await groupLeaderboard(user.id, input.id, input.week)
      : input.view === "groupHistory" ? { history: await groupHistory(user.id, input.id) }
      : input.view === "invitable" ? { friends: await invitableFriends(user.id, input.id) }
      : input.view === "leaderboard" ? await friendsLeaderboard(user.id, input.week)
      : input.view === "history" ? await studyHistory(user.id, input.week)
      : input.view === "friendHistory" ? await friendHistory(user.id, input.id, input.week)
      : input.view === "record" ? await competitionRecord(user.id)
      : { privacy: (await privacyOf([user.id])).get(user.id), rules: { timezone: COMPETITION_TIMEZONE, sessionCapSeconds: SESSION_CREDIT_CAP_SECONDS, dailyCapSeconds: DAILY_CREDIT_CAP_SECONDS, graceSeconds: HEARTBEAT_GRACE_SECONDS } };
    return privateJson({ ok: true, ...data });
  } catch (error) {
    return featureFailure(error);
  }
}

/** Per-user limits for actions that reach other people. */
const LIMITS: Partial<Record<z.infer<typeof mutation>["kind"], [number, number]>> = {
  sendRequest: [10, 3600], inviteToGroup: [20, 3600], createGroup: [10, 86400], respondRequest: [60, 3600], block: [30, 3600],
};

export async function POST(request: Request) {
  try {
    const user = await learnerAccount();
    const input = await validatedBody(request, mutation);
    const limit = LIMITS[input.kind];
    if (limit) {
      const decision = await requestLimit(`circles:${input.kind}:${user.id}`, limit[0], limit[1]);
      if (decision !== "allowed") throw new GoalError(decision === "limited" ? "tooManyRequests" : "serviceUnavailable", decision === "limited" ? 429 : 503);
    }
    const t = await getTranslations("circles.notifications");
    const result = input.kind === "sendRequest" ? await sendFriendRequest(user.id, input.email, { title: name => t("requestTitle", { name }), body: t("requestBody") })
      : input.kind === "respondRequest" ? await respondToRequest(user.id, input.id, input.action, { acceptedTitle: name => t("acceptedTitle", { name }), acceptedBody: t("acceptedBody") })
      : input.kind === "cancelInvitation" ? await cancelInvitation(user.id, input.id)
      : input.kind === "removeFriend" ? await removeFriend(user.id, input.id)
      : input.kind === "block" ? await blockUser(user.id, input.id)
      : input.kind === "unblock" ? await unblockUser(user.id, input.id)
      : input.kind === "createGroup" ? { group: await createGroup(user.id, input.value) }
      : input.kind === "updateGroup" ? { group: await updateGroup(user.id, input.id, input.value) }
      : input.kind === "deleteGroup" ? await deleteGroup(user.id, input.id)
      : input.kind === "inviteToGroup" ? await inviteToGroup(user.id, input.id, input.userIds, { title: (name, group) => t("groupInviteTitle", { name, group }), body: t("groupInviteBody") })
      : input.kind === "respondGroupInvitation" ? await respondToGroupInvitation(user.id, input.id, input.action, { title: (name, group) => t("groupJoinedTitle", { name, group }), body: t("groupJoinedBody") })
      : input.kind === "leaveGroup" ? await leaveGroup(user.id, input.id)
      : input.kind === "manageMember" ? await manageMember(user.id, input.id, input.memberId, input.action)
      : { privacy: await updatePrivacy(user.id, input.value) };
    return privateJson({ ok: true, ...result });
  } catch (error) {
    return featureFailure(error);
  }
}
