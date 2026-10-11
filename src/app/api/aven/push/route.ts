import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  learnerAccount,
  privateJson,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import { GoalError } from "@/lib/goals/service";
import { safePushEndpoint } from "@/lib/aven/push";
const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subscribe"),
    subscription: z.object({
      endpoint: z.string().url().max(2000).refine(safePushEndpoint),
      keys: z.object({
        p256dh: z
          .string()
          .regex(/^[\w-]+$/)
          .max(100),
        auth: z
          .string()
          .regex(/^[\w-]+$/)
          .max(30),
      }),
    }),
  }),
  z.object({ kind: z.literal("unsubscribe"), endpoint: z.string().max(2000) }),
]);
export async function POST(request: Request) {
  try {
    const user = await learnerAccount(),
      input = await validatedBody(request, schema);
    const db = getDb();
    if (input.kind === "unsubscribe")
      await db
        .delete(s.pushSubscriptions)
        .where(
          and(
            eq(s.pushSubscriptions.userId, user.id),
            eq(s.pushSubscriptions.endpoint, input.endpoint),
          ),
        );
    else
      await db.transaction(async (tx) => {
        await tx
          .select({ id: s.users.id })
          .from(s.users)
          .where(eq(s.users.id, user.id))
          .for("update");
        const key = Buffer.from(input.subscription.keys.p256dh, "base64url"),
          auth = Buffer.from(input.subscription.keys.auth, "base64url");
        if (key.length !== 65 || key[0] !== 4 || auth.length !== 16)
          throw new GoalError("invalidInput");
        const [existing] = await tx
          .select()
          .from(s.pushSubscriptions)
          .where(eq(s.pushSubscriptions.endpoint, input.subscription.endpoint));
        if (existing && existing.userId !== user.id)
          throw new GoalError("recordUnavailable", 404);
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(s.pushSubscriptions)
          .where(eq(s.pushSubscriptions.userId, user.id));
        if (!existing && count >= 3) throw new GoalError("limitReached");
        await tx
          .insert(s.pushSubscriptions)
          .values({
            userId: user.id,
            endpoint: input.subscription.endpoint,
            ...input.subscription.keys,
          })
          .onConflictDoUpdate({
            target: s.pushSubscriptions.endpoint,
            set: input.subscription.keys,
          });
      });
    return privateJson({ ok: true });
  } catch (error) {
    return featureFailure(error);
  }
}
