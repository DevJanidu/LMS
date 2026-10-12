import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getCalendarBlock, mutateCalendar } from "@/lib/services/calendar";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { calendarOccurrences } from "@/lib/calendar/model";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { GoalError } from "@/lib/goals/service";
import { overlaps } from "./planning";
import type { AvenProposal } from "./validation";
export function localStudyInstant(value: string, timezone: string) {
  const utc = zonedToUtc(value, timezone);
  if (wallTime(utc, timezone) !== value) throw new GoalError("invalidSchedule");
  return utc;
}
export async function moveSessionsProposal(
  userId: string,
  timezone: string,
  sessions: { blockId: string; date: string; localStartsAt: string }[],
  explanation: string,
): Promise<Extract<AvenProposal, { kind: "calendarChanges" }>> {
  const changes: Extract<AvenProposal, { kind: "calendarChanges" }>["changes"] =
    [];
  const seen = new Set<string>();
  for (const session of sessions) {
    if (seen.has(session.blockId + ":" + session.date))
      throw new GoalError("invalidProposal");
    seen.add(session.blockId + ":" + session.date);
    const block = await getCalendarBlock(userId, session.blockId);
    let occurrence = calendarOccurrences(
      [block],
      { from: shiftDay(session.date, -2), to: shiftDay(session.date, 3) },
      block.timezone,
    ).find((item) => item.date === session.date);
    if (!occurrence && block.repeat === "once") {
      const originalDay = localDay(block.startsAt, block.timezone);
      occurrence = calendarOccurrences(
        [block],
        { from: shiftDay(originalDay, -1), to: shiftDay(originalDay, 2) },
        block.timezone,
      )[0];
    }
    if (!occurrence) throw new GoalError("recordUnavailable", 404);
    const startsAt = localStudyInstant(session.localStartsAt, timezone);
    const endsAt = new Date(
      Date.parse(startsAt) +
        Date.parse(occurrence.endsAt) -
        Date.parse(occurrence.startsAt),
    ).toISOString();
    changes.push({
      action: "move",
      blockId: block.id,
      date: occurrence.date,
      expectedUpdatedAt: block.updatedAt,
      startsAt,
      endsAt,
    });
  }
  return { kind: "calendarChanges", explanation, changes };
}
export async function applyCalendarProposal(
  tx: DbTransaction,
  userId: string,
  timezone: string,
  value: Extract<AvenProposal, { kind: "calendarChanges" | "calendarCreate" }>,
) {
  const originals = new Map<
    string,
    Awaited<ReturnType<typeof getCalendarBlock>>
  >();
  const removed = new Set<string>();
  const slots: { startsAt: string; endsAt: string }[] = [];
  if (value.kind === "calendarChanges") {
    for (const item of value.changes) {
      if (
        item.action === "cancel" &&
        item.scope !== "one" &&
        value.changes.some(
          (other) => other !== item && other.blockId === item.blockId,
        )
      )
        throw new GoalError("invalidProposal");
      const block = await getCalendarBlock(userId, item.blockId);
      if (block.updatedAt !== item.expectedUpdatedAt)
        throw new GoalError("conflict", 409);
      if (removed.has(block.id + ":" + item.date))
        throw new GoalError("invalidProposal");
      const occurrence = calendarOccurrences(
        [block],
        { from: shiftDay(item.date, -2), to: shiftDay(item.date, 3) },
        block.timezone,
      ).find((entry) => entry.date === item.date);
      if (!occurrence) throw new GoalError("recordUnavailable", 404);
      if (
        item.action === "move" &&
        Date.parse(item.endsAt) - Date.parse(item.startsAt) !==
          Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)
      )
        throw new GoalError("invalidSchedule");
      originals.set(block.id, block);
      removed.add(block.id + ":" + item.date);
      if (item.action === "move") slots.push(item);
    }
  } else slots.push(value);
  if (slots.length) {
    if (
      slots.some(
        (item) =>
          Date.parse(item.startsAt) < Date.now() ||
          Date.parse(item.endsAt) <= Date.parse(item.startsAt) ||
          Date.parse(item.endsAt) - Date.parse(item.startsAt) > 4 * 3600000 ||
          Date.parse(item.startsAt) > Date.now() + 366 * 86400000,
      )
    )
      throw new GoalError("invalidSchedule");
    const from = localDay(
        Math.min(...slots.map((item) => Date.parse(item.startsAt))),
        timezone,
      ),
      to = shiftDay(
        localDay(
          Math.max(...slots.map((item) => Date.parse(item.endsAt))),
          timezone,
        ),
        1,
      );
    const blocks = await getScheduleBlocksInRange(
      userId,
      { from, to },
      timezone,
    );
    const existing = calendarOccurrences(blocks, { from, to }, timezone).filter(
      (item) =>
        !removed.has(item.block.id + ":" + item.date) &&
        !(
          value.kind === "calendarChanges" &&
          value.changes.some(
            (change) =>
              change.action === "cancel" &&
              change.blockId === item.block.id &&
              (change.scope === "all" ||
                (change.scope === "future" && item.date >= change.date)),
          )
        ),
    );
    for (let index = 0; index < slots.length; index++)
      if (
        existing.some((item) => overlaps(slots[index], item)) ||
        slots.slice(0, index).some((item) => overlaps(slots[index], item))
      )
        throw new GoalError("scheduleOverlap", 409);
  }
  const blockIds: string[] = [];
  if (value.kind === "calendarCreate") {
    if (
      value.timezone !== timezone ||
      (value.repeat === "weekly" &&
        (!value.weekdays.length ||
          (value.until !== null &&
            (value.until < localDay(value.startsAt, timezone) ||
              Date.parse(value.until + "T00:00Z") >
                Date.now() + 366 * 86400000))))
    )
      throw new GoalError("invalidSchedule");
    if (value.repeat === "weekly") {
      const candidate = {
        id: crypto.randomUUID(),
        userId,
        title: value.title,
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        timezone,
        repeat: value.repeat,
        weekdays: value.weekdays,
        recurrenceUntil: value.until ?? undefined,
        exceptions: [],
        color: "brand" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const from = localDay(value.startsAt, timezone),
        to = shiftDay(value.until ?? shiftDay(from, 365), 1);
      const future = calendarOccurrences(
        await getScheduleBlocksInRange(userId, { from, to }, timezone),
        { from, to },
        timezone,
      );
      if (
        calendarOccurrences([candidate], { from, to }, timezone).some((item) =>
          future.some((old) => overlaps(item, old)),
        )
      )
        throw new GoalError("scheduleOverlap", 409);
    }
    const [subject] = value.subjectId
      ? await tx
          .select()
          .from(s.subjects)
          .where(
            and(
              eq(s.subjects.id, value.subjectId),
              eq(s.subjects.userId, userId),
            ),
          )
      : [];
    const id = crypto.randomUUID();
    await mutateCalendar(
      userId,
      {
        operationId: crypto.randomUUID(),
        command: {
          kind: "create",
          value: {
            id,
            subjectId: value.subjectId ?? undefined,
            topicId: value.topicId ?? undefined,
            title: value.title,
            startsAt: value.startsAt,
            endsAt: value.endsAt,
            timezone,
            repeat: value.repeat,
            weekdays: value.weekdays,
            recurrenceUntil: value.until ?? undefined,
            exceptions: [],
            color: (subject?.displayColor ?? "brand") as
              "brand" | "success" | "orange" | "purple",
          },
        },
      },
      tx,
    );
    blockIds.push(id);
  } else {
    // Validate all versions before changing any record; roll back the entire batch on failure.
    for (const item of value.changes) {
      const current = originals.get(item.blockId)!;
      const result = await mutateCalendar(
        userId,
        {
          operationId: crypto.randomUUID(),
          expectedUpdatedAt: current.updatedAt,
          command:
            item.action === "move"
              ? {
                  kind: "move",
                  id: item.blockId,
                  date: item.date,
                  scope: "one",
                  startsAt: item.startsAt,
                  endsAt: item.endsAt,
                  newSeriesId: crypto.randomUUID(),
                }
              : {
                  kind: "delete",
                  id: item.blockId,
                  date: item.date,
                  scope: item.scope,
                  newSeriesId: crypto.randomUUID(),
                },
        },
        tx,
      );
      blockIds.push(...result.blocks.map((block) => block.id));
      for (const block of result.blocks) originals.set(block.id, block);
    }
  }
  const persisted = blockIds.length
    ? await tx
        .select({ id: s.scheduleBlocks.id })
        .from(s.scheduleBlocks)
        .where(
          and(
            eq(s.scheduleBlocks.userId, userId),
            inArray(s.scheduleBlocks.id, blockIds),
          ),
        )
    : [];
  if (persisted.length !== new Set(blockIds).size)
    throw new GoalError("persistenceUnavailable", 503);
  return { blockIds: [...new Set(blockIds)] };
}
