import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getCalendarBlock, mutateCalendar } from "@/lib/services/calendar";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import {
  applyCalendarCommand,
  calendarOccurrences,
} from "@/lib/calendar/model";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { GoalError } from "@/lib/goals/service";
import type { ScheduleBlock } from "@/types";
import { overlaps } from "./planning";
import { matchSubject } from "./decomposition";
import type { AvenProposal } from "./validation";
type Occurrence = ReturnType<typeof calendarOccurrences>[number];
type Scope = "one" | "future" | "all";
const HORIZON_DAYS = 365;
export function localStudyInstant(value: string, timezone: string) {
  const utc = zonedToUtc(value, timezone);
  if (wallTime(utc, timezone) !== value) throw new GoalError("invalidSchedule");
  return utc;
}
/** Pairs each candidate occurrence with the first existing commitment it overlaps. */
export function overlappingOccurrences(
  candidates: readonly Occurrence[],
  existing: readonly Occurrence[],
) {
  return candidates.flatMap((candidate) => {
    const clash = existing.find((item) => overlaps(candidate, item));
    return clash ? [{ candidate, existing: clash }] : [];
  });
}
const horizonEnd = (from: string, until?: string | null) =>
  shiftDay(
    until && until < shiftDay(from, HORIZON_DAYS)
      ? until
      : shiftDay(from, HORIZON_DAYS),
    1,
  );
async function commitmentsBetween(
  userId: string,
  timezone: string,
  from: string,
  to: string,
  excludeBlockIds: string[] = [],
) {
  return calendarOccurrences(
    (await getScheduleBlocksInRange(userId, { from, to }, timezone)).filter(
      (block) => !excludeBlockIds.includes(block.id),
    ),
    { from, to },
    timezone,
  );
}
/** Blocks produced by a scoped move, for previews and conflict checks. */
function movedBlocks(
  block: ScheduleBlock,
  date: string,
  scope: Scope,
  startsAt: string,
  endsAt: string,
  userId: string,
) {
  return applyCalendarCommand(
    block,
    {
      kind: "move",
      id: block.id,
      date,
      scope,
      startsAt,
      endsAt,
      newSeriesId: crypto.randomUUID(),
    },
    userId,
    new Date().toISOString(),
  ).blocks;
}
export async function moveSessionsProposal(
  userId: string,
  timezone: string,
  sessions: {
    blockId: string;
    date: string;
    localStartsAt: string;
    scope: Scope;
  }[],
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
    // A one-off session has no series; never widen its scope.
    const scope: Scope = block.repeat === "once" ? "one" : session.scope;
    if (
      scope !== "one" &&
      sessions.some(
        (other) => other !== session && other.blockId === session.blockId,
      )
    )
      throw new GoalError("invalidProposal");
    const startsAt = localStudyInstant(session.localStartsAt, timezone);
    const endsAt = new Date(
      Date.parse(startsAt) +
        Date.parse(occurrence.endsAt) -
        Date.parse(occurrence.startsAt),
    ).toISOString();
    const today = localDay(Date.now(), timezone),
      from = scope === "all" ? today : occurrence.date;
    changes.push({
      action: "move",
      scope,
      affected:
        scope === "one"
          ? 1
          : calendarOccurrences(
              [block],
              { from, to: horizonEnd(from, block.recurrenceUntil) },
              block.timezone,
            ).length,
      blockId: block.id,
      date: occurrence.date,
      expectedUpdatedAt: block.updatedAt,
      startsAt,
      endsAt,
    });
  }
  return { kind: "calendarChanges", explanation, changes };
}
export interface StudyScheduleRequest {
  title: string;
  subjectId: string | null;
  subjectName: string | null;
  topicId: string | null;
  localStartsAt: string;
  durationMinutes: number;
  repeat: "once" | "daily" | "weekly";
  weekdays: number[];
  until: string | null;
  skipConflicts: boolean;
  explanation: string;
}
/**
 * Resolve a natural-language schedule into a calendarCreate proposal, checking every
 * occurrence against existing commitments before anything is proposed.
 */
export async function studyScheduleProposal(
  userId: string,
  timezone: string,
  request: StudyScheduleRequest,
): Promise<
  | { ready: true; value: Extract<AvenProposal, { kind: "calendarCreate" }> }
  | { ready: false; result: Record<string, unknown> }
> {
  const subjects = await getDb()
    .select({ id: s.subjects.id, title: s.subjects.title })
    .from(s.subjects)
    .where(eq(s.subjects.userId, userId));
  if (
    request.subjectId &&
    !subjects.some((item) => item.id === request.subjectId)
  )
    throw new GoalError("recordUnavailable", 404);
  const subjectId =
    request.subjectId ?? matchSubject(request.subjectName, subjects);
  const weekly = request.repeat !== "once",
    weekdays =
      request.repeat === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : request.repeat === "weekly"
          ? [...new Set(request.weekdays)].sort()
          : [];
  if (request.repeat === "weekly" && !weekdays.length)
    throw new GoalError("invalidSchedule");
  const startsAt = localStudyInstant(request.localStartsAt, timezone),
    endsAt = new Date(
      Date.parse(startsAt) + request.durationMinutes * 60000,
    ).toISOString(),
    from = localDay(startsAt, timezone);
  if (request.until && request.until < from)
    throw new GoalError("invalidSchedule");
  const candidate: ScheduleBlock = {
    id: crypto.randomUUID(),
    userId,
    title: request.title,
    startsAt,
    endsAt,
    timezone,
    repeat: weekly ? "weekly" : "once",
    weekdays,
    recurrenceUntil: weekly ? (request.until ?? undefined) : undefined,
    exceptions: [],
    color: "brand",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const to = weekly ? horizonEnd(from, request.until) : shiftDay(from, 2);
  const occurrences = calendarOccurrences([candidate], { from, to }, timezone);
  const clashes = overlappingOccurrences(
    occurrences,
    await commitmentsBetween(userId, timezone, from, to),
  );
  const conflicts = clashes.slice(0, 20).map(({ candidate, existing }) => ({
    date: candidate.date,
    title: existing.title.slice(0, 200),
    startsAt: existing.startsAt,
    endsAt: existing.endsAt,
  }));
  const subjectMatched = Boolean(subjectId) || !request.subjectName;
  if (
    clashes.length &&
    (!request.skipConflicts || !weekly || clashes.length === occurrences.length)
  )
    return {
      ready: false,
      result: {
        proposalCreated: false,
        occurrences: occurrences.length,
        conflictCount: clashes.length,
        conflicts: conflicts.slice(0, 10).map((item) => ({
          date: item.date,
          existing: item.title,
          localStartsAt: wallTime(item.startsAt, timezone),
          localEndsAt: wallTime(item.endsAt, timezone),
        })),
        subjectMatched,
        next: weekly
          ? "Tell the student about these conflicts. Ask whether to skip those dates (call again with skipConflicts=true) or choose another time."
          : "Tell the student about the conflict and suggest another time.",
      },
    };
  return {
    ready: true,
    value: {
      kind: "calendarCreate",
      explanation: request.explanation,
      title: request.title,
      subjectId,
      topicId: request.topicId,
      startsAt,
      endsAt,
      timezone,
      repeat: weekly ? "weekly" : "once",
      weekdays,
      until: weekly ? request.until : null,
      skipDates: [...new Set(clashes.map((item) => item.candidate.date))],
      occurrences:
        occurrences.length -
        new Set(clashes.map((item) => item.candidate.date)).size,
      conflicts,
    },
  };
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
  const seriesMoves: {
    block: ScheduleBlock;
    blocks: ScheduleBlock[];
    from: string;
  }[] = [];
  if (value.kind === "calendarChanges") {
    for (const item of value.changes) {
      if (
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
      if (
        item.action === "move" &&
        item.scope !== "one" &&
        block.repeat === "once"
      )
        throw new GoalError("invalidProposal");
      originals.set(block.id, block);
      removed.add(block.id + ":" + item.date);
      if (item.action === "move") {
        slots.push(item);
        if (item.scope !== "one")
          seriesMoves.push({
            block,
            from:
              item.scope === "all" ? localDay(Date.now(), timezone) : item.date,
            blocks: movedBlocks(
              block,
              item.date,
              item.scope,
              item.startsAt,
              item.endsAt,
              userId,
            ),
          });
      }
    }
  } else slots.push(value);
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
  // Single-occurrence moves: check each destination against what remains of the calendar.
  const singles =
    value.kind === "calendarChanges"
      ? value.changes.filter(
          (item): item is Extract<typeof item, { action: "move" }> =>
            item.action === "move" && item.scope === "one",
        )
      : [];
  if (singles.length) {
    const from = localDay(
        Math.min(...singles.map((item) => Date.parse(item.startsAt))),
        timezone,
      ),
      to = shiftDay(
        localDay(
          Math.max(...singles.map((item) => Date.parse(item.endsAt))),
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
              change.blockId === item.block.id &&
              (change.scope === "all" ||
                (change.scope === "future" && item.date >= change.date)),
          )
        ),
    );
    for (let index = 0; index < singles.length; index++)
      if (
        existing.some((item) => overlaps(singles[index], item)) ||
        singles.slice(0, index).some((item) => overlaps(singles[index], item))
      )
        throw new GoalError("scheduleOverlap", 409);
  }
  // Series moves: every resulting occurrence within a year must stay clear of other commitments.
  for (const move of seriesMoves) {
    const to = horizonEnd(move.from, move.block.recurrenceUntil);
    const moved = calendarOccurrences(
      move.blocks,
      { from: move.from, to },
      timezone,
    ).filter((item) => item.date >= move.from);
    if (
      overlappingOccurrences(
        moved,
        await commitmentsBetween(userId, timezone, move.from, to, [
          move.block.id,
        ]),
      ).length
    )
      throw new GoalError("scheduleOverlap", 409);
  }
  const blockIds: string[] = [];
  if (value.kind === "calendarCreate") {
    if (
      value.timezone !== timezone ||
      (value.repeat === "once" && value.skipDates.length) ||
      (value.repeat === "weekly" &&
        (!value.weekdays.length ||
          (value.until !== null &&
            (value.until < localDay(value.startsAt, timezone) ||
              Date.parse(value.until + "T00:00Z") >
                Date.now() + 366 * 86400000))))
    )
      throw new GoalError("invalidSchedule");
    // Skipped conflict dates become cancelled exceptions on a single series row.
    const exceptions = value.skipDates.map((date) => ({
      date,
      cancelled: true,
    }));
    const candidate: ScheduleBlock = {
      id: crypto.randomUUID(),
      userId,
      title: value.title,
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      timezone,
      repeat: value.repeat,
      weekdays: value.weekdays,
      recurrenceUntil: value.until ?? undefined,
      exceptions,
      color: "brand",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const from = localDay(value.startsAt, timezone),
      to =
        value.repeat === "weekly"
          ? horizonEnd(from, value.until)
          : shiftDay(from, 2);
    const occurrences = calendarOccurrences(
      [candidate],
      { from, to },
      timezone,
    );
    if (!occurrences.length) throw new GoalError("invalidSchedule");
    if (
      overlappingOccurrences(
        occurrences,
        await commitmentsBetween(userId, timezone, from, to),
      ).length
    )
      throw new GoalError("scheduleOverlap", 409);
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
    if (value.subjectId && !subject)
      throw new GoalError("recordUnavailable", 404);
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
            exceptions,
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
                  scope: item.scope,
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
