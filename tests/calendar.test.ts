import { describe, expect, it, vi } from "vitest";
import type { ScheduleBlock } from "@/types";
import { applyCalendarCommand, calendarOccurrences, occurrenceId } from "@/lib/calendar/model";
import { CalendarStore } from "@/lib/calendar/store";

const block: ScheduleBlock = { id: "11111111-1111-4111-8111-111111111111", userId: "owner", title: "Study", startsAt: "2026-10-05T09:00:00.000Z", endsAt: "2026-10-05T10:00:00.000Z", timezone: "Europe/London", repeat: "weekly", weekdays: [1, 3], exceptions: [], color: "brand", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
const range = { from: "2026-10-05", to: "2026-10-12" };
const now = "2026-10-06T00:00:00.000Z";
const moved = { kind: "move" as const, id: block.id, date: "2026-10-07", scope: "one" as const, startsAt: "2026-11-06T14:00:00.000Z", endsAt: "2026-11-06T15:00:00.000Z" };
const response = (value: unknown, status = 200) => Promise.resolve(Response.json(value, { status }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

describe("calendar recurrence commands", () => {
  it("moves just one occurrence across ranges without losing its identity", () => {
    const change = applyCalendarCommand(block, moved, "owner", now);
    const original = calendarOccurrences(change.blocks, range, "Europe/London");
    expect(original).toHaveLength(1);
    const target = calendarOccurrences(change.blocks, { from: "2026-11-06", to: "2026-11-07" }, "Europe/London");
    expect(target.find(e => e.date === moved.date)?.startsAt).toBe(moved.startsAt);
    expect(occurrenceId(target.find(e => e.date === moved.date)!)).toBe(`${block.id}@2026-10-07`);
  });
  it("keeps earlier exceptions when splitting and preserves later cancellations", () => {
    const original = { ...block, exceptions: [{ date: "2026-10-05", cancelled: true }, { date: "2026-10-12", cancelled: true }] };
    const change = applyCalendarCommand(original, { ...moved, scope: "future", newSeriesId: "future", startsAt: "2026-10-08T09:00:00.000Z", endsAt: "2026-10-08T10:00:00.000Z" }, "owner", now);
    expect(change.blocks[0].recurrenceUntil).toBe("2026-10-06");
    expect(change.blocks[0].exceptions[0].date).toBe("2026-10-05");
    expect(change.blocks[1].weekdays).toEqual([2, 4]);
    expect(change.blocks[1].exceptions[0]).toMatchObject({ date: "2026-10-13", cancelled: true });
    expect(calendarOccurrences(change.blocks, { from: "2026-10-01", to: "2026-10-16" }, "Europe/London").map(e => e.date)).toEqual(["2026-10-08", "2026-10-15"]);
  });
  it("moves all events while preserving the first occurrence, duration and exceptions", () => {
    const change = applyCalendarCommand({ ...block, exceptions: [{ date: "2026-10-12", cancelled: true }] }, { ...moved, scope: "all", startsAt: "2026-10-08T13:00:00.000Z", endsAt: "2026-10-08T14:00:00.000Z" }, "owner", now);
    expect(change.blocks[0].startsAt).toBe("2026-10-06T13:00:00.000Z");
    expect(change.blocks[0].weekdays).toEqual([2, 4]);
    expect(change.blocks[0].exceptions[0].date).toBe("2026-10-13");
  });
  it("deletes one, future or all events explicitly", () => {
    const command = { kind: "delete" as const, id: block.id, date: "2026-10-07", scope: "one" as const };
    expect(applyCalendarCommand(block, command, "owner", now).blocks[0].exceptions).toEqual([{ date: command.date, cancelled: true }]);
    expect(applyCalendarCommand(block, { ...command, scope: "future" }, "owner", now).blocks[0].recurrenceUntil).toBe("2026-10-06");
    expect(applyCalendarCommand(block, { ...command, scope: "all" }, "owner", now).removed).toEqual([block.id]);
  });
  it("supports all seven weekdays and wall clocks through DST", () => {
    const events = calendarOccurrences([{ ...block, weekdays: [0, 1, 2, 3, 4, 5, 6] }], { from: "2026-10-19", to: "2026-10-26" }, "Europe/London");
    expect(events).toHaveLength(7);
    expect(events[6].startsAt).toBe("2026-10-25T10:00:00.000Z");
  });
  it("includes overnight overlaps and excludes events exactly at the exclusive end", () => {
    const once = { ...block, repeat: "once" as const, timezone: "UTC", startsAt: "2026-10-04T23:00:00.000Z", endsAt: "2026-10-05T01:00:00.000Z" };
    expect(calendarOccurrences([once], { from: "2026-10-05", to: "2026-10-06" }, "UTC")).toHaveLength(1);
    expect(calendarOccurrences([{ ...once, startsAt: "2026-10-06T00:00:00.000Z", endsAt: "2026-10-06T01:00:00.000Z" }], { from: "2026-10-05", to: "2026-10-06" }, "UTC")).toHaveLength(0);
  });
  it("can clear an occurrence's subject, topic and note without clearing its series", () => {
    const original = { ...block, subjectId: "subject", topicId: "topic", note: "old note" };
    const change = applyCalendarCommand(original, { kind: "edit", id: block.id, date: "2026-10-07", scope: "one", value: { ...block, startsAt: "2026-10-07T09:00:00.000Z", endsAt: "2026-10-07T10:00:00.000Z" } }, "owner", now);
    const events = calendarOccurrences(change.blocks, range, "Europe/London");
    expect(events[0].block.subjectId).toBe("subject");
    expect(events[1].block.subjectId).toBeUndefined();
    expect(events[1].block.note).toBeUndefined();
  });
  it("avoids empty historical series and can delete a series whose anchor is not a selected weekday", () => {
    const change = applyCalendarCommand(block, { ...moved, date: "2026-10-05", scope: "future", newSeriesId: "future", startsAt: "2026-10-05T14:00:00.000Z", endsAt: "2026-10-05T15:00:00.000Z" }, "owner", now);
    expect(change.blocks).toHaveLength(1); expect(change.removed).toEqual([block.id]);
    expect(applyCalendarCommand({ ...block, weekdays: [3] }, { kind: "delete", id: block.id, date: "2026-10-05", scope: "all" }, "owner", now).removed).toEqual([block.id]);
  });
});

describe("optimistic calendar journal", () => {
  const once = { ...block, repeat: "once" as const, timezone: "UTC" };
  const move = { ...moved, date: "2026-10-05", startsAt: "2026-10-06T09:00:00.000Z", endsAt: "2026-10-06T10:00:00.000Z" };
  it("updates immediately, serializes rapid moves and uses the acknowledged version", async () => {
    const first = deferred<Response>(), second = deferred<Response>();
    const transport = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = new CalendarStore("owner", [once], range, transport);
    const a = store.mutate(move);
    const b = store.mutate({ ...move, startsAt: "2026-10-08T09:00:00.000Z", endsAt: "2026-10-08T10:00:00.000Z" });
    expect(store.getSnapshot().blocks[0].startsAt).toBe("2026-10-08T09:00:00.000Z");
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const saved = { ...once, ...move, updatedAt: now };
    first.resolve(Response.json({ ok: true, blocks: [saved], removed: [] }));
    await a;
    expect(store.getSnapshot().blocks[0].startsAt).toBe("2026-10-08T09:00:00.000Z");
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(JSON.parse(transport.mock.calls[1][1].body).expectedUpdatedAt).toBe(now);
    second.resolve(Response.json({ ok: true, blocks: [{ ...saved, startsAt: "2026-10-08T09:00:00.000Z" }], removed: [] }));
    await expect(b).resolves.toBe(true);
  });
  it("rolls back a failed earlier move while keeping a newer queued move", async () => {
    const failed = deferred<Response>();
    const transport = vi.fn().mockReturnValueOnce(failed.promise).mockImplementation(() => response({ ok: true, blocks: [{ ...once, startsAt: "2026-10-08T09:00:00.000Z" }], removed: [] }));
    const store = new CalendarStore("owner", [once], range, transport);
    const a = store.mutate(move), b = store.mutate({ ...move, startsAt: "2026-10-08T09:00:00.000Z" });
    failed.resolve(Response.json({ ok: false, error: "invalidInput" }, { status: 400 }));
    await expect(a).resolves.toBe(false);
    expect(store.getSnapshot().blocks[0].startsAt).toBe("2026-10-08T09:00:00.000Z");
    await expect(b).resolves.toBe(true);
  });
  it("deduplicates range reads, caches navigation and rejects an old read after deletion", async () => {
    const read = deferred<Response>();
    const transport = vi.fn().mockReturnValueOnce(read.promise).mockImplementation(() => response({ ok: true, blocks: [], removed: [once.id] }));
    const store = new CalendarStore("owner", [once], range, transport);
    const next = { from: "2026-10-12", to: "2026-10-19" };
    const a = store.load(next), b = store.load(next);
    expect(transport).toHaveBeenCalledTimes(1);
    await store.mutate({ kind: "delete", id: once.id, date: "2026-10-05", scope: "one" });
    read.resolve(Response.json({ ok: true, blocks: [once] }));
    await Promise.all([a, b]);
    expect(store.getSnapshot().blocks).toEqual([]);
    await store.load(next); await store.load(range);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it("restores a failed deletion and retains creation data for an idempotent retry", async () => {
    const transport = vi.fn().mockImplementation(() => response({ ok: false, error: "saveFailed" }, 503));
    const store = new CalendarStore("owner", [once], range, transport);
    const deletion = store.mutate({ kind: "delete", id: once.id, date: "2026-10-05", scope: "one" });
    expect(store.getSnapshot().blocks).toEqual([]);
    await deletion;
    expect(store.getSnapshot().blocks).toEqual([once]);
    const created = { ...once, id: "new" };
    await store.mutate({ kind: "create", value: created });
    const operationId = JSON.parse(transport.mock.calls.at(-1)![1].body).operationId;
    expect(store.getSnapshot().blocks).toEqual([once]);
    expect(store.getSnapshot().canRetry).toBe(true);
    transport.mockImplementation(() => response({ ok: true, blocks: [created], removed: [] }));
    await store.retry();
    expect(JSON.parse(transport.mock.calls.at(-1)![1].body).operationId).toBe(operationId);
    expect(store.getSnapshot().blocks).toHaveLength(2);
  });
  it("retains recurrence exceptions when another cached range returns the same series", async () => {
    const transport = vi.fn().mockImplementation(() => response({ ok: true, blocks: [block] }));
    const store = new CalendarStore("owner", [{ ...block, exceptions: [{ date: "2026-10-07", cancelled: true }] }], range, transport);
    await store.load({ from: "2026-10-12", to: "2026-10-19" });
    expect(calendarOccurrences(store.getSnapshot().blocks, range, "Europe/London")).toHaveLength(1);
    await store.load(range);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("waits for an optimistic future series to be created before moving it again", async () => {
    const first = deferred<Response>();
    const split = { ...moved, scope: "future" as const, newSeriesId: "new-series", startsAt: "2026-10-07T14:00:00.000Z", endsAt: "2026-10-07T15:00:00.000Z" };
    const change = applyCalendarCommand(block, split, "owner", now);
    const transport = vi.fn().mockReturnValueOnce(first.promise).mockImplementation(() => response({ ok: true, blocks: [{ ...change.blocks[1], startsAt: "2026-10-07T16:00:00.000Z" }], removed: [] }));
    const store = new CalendarStore("owner", [block], range, transport);
    const a = store.mutate(split), b = store.mutate({ ...moved, id: "new-series", startsAt: "2026-10-07T16:00:00.000Z", endsAt: "2026-10-07T17:00:00.000Z" });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    first.resolve(Response.json({ ok: true, ...change }));
    await expect(a).resolves.toBe(true); await expect(b).resolves.toBe(true);
    expect(JSON.parse(transport.mock.calls[1][1].body).expectedUpdatedAt).toBe(now);
  });
});
