import type { ScheduleBlock } from "@/types";
import type { CalendarCommand, CalendarMutation } from "@/lib/validation/calendar";
import { applyCalendarCommand, mergeCalendarChange, type CalendarChange, type CalendarRange } from "./model";
import { localDay, zonedToUtc } from "@/lib/analytics";
import { beginWrite } from "@/lib/workspace/write-status";

type Transport = (url: string, init?: RequestInit) => Promise<Response>;
type Layer = { command: CalendarCommand; operationId: string; key: string; now: string };
type Snapshot = { blocks: ScheduleBlock[]; pending: ReadonlySet<string>; loading: boolean; error: string; canRetry: boolean };
const keyOf = (command: CalendarCommand) => command.kind === "create" ? command.value.id : command.id;
const rangeKey = (range: CalendarRange) => `${range.from}/${range.to}`;

/** One per-user cache and ordered optimistic journal. Network reads cannot reset newer edits. */
export class CalendarStore {
  private confirmed = new Map<string, ScheduleBlock>();
  private layers: Layer[] = [];
  private queues = new Map<string, Promise<boolean>>();
  private cached = new Map<string, { at: number; ids: string[] }>();
  private reads = new Map<string, Promise<void>>();
  private touched = new Map<string, number>();
  private epoch = 0;
  private accountRevision?: string;
  synchronizeRevision(revision: string) {
    if (this.accountRevision === revision) return false;
    const changed = this.accountRevision !== undefined;
    this.accountRevision = revision;
    if (changed) this.cached.clear();
    return changed;
  }
  private listeners = new Set<() => void>();
  private loading = 0;
  private error = "";
  private errorKey?: string;
  private failed?: Layer;
  private snapshot: Snapshot;
  constructor(private userId: string, initial: ScheduleBlock[], range: CalendarRange, private transport: Transport = (url, init) => fetch(url, init), private timezone = "UTC") {
    initial.forEach(b => this.confirmed.set(b.id, b));
    this.cached.set(rangeKey(range), { at: Date.now(), ids: initial.map(b => b.id) });
    this.snapshot = { blocks: initial, pending: new Set(), loading: false, error: "", canRetry: false };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private emit() {
    let blocks = [...this.confirmed.values()];
    for (const layer of this.layers) {
      try { blocks = mergeCalendarChange(blocks, applyCalendarCommand(blocks.find(b => b.id === layer.key), layer.command, this.userId, layer.now)); }
      catch { /* A failed create/delete can invalidate a dependent queued edit. */ }
    }
    const pending = new Set(this.layers.flatMap(l => l.command.kind !== "create" && l.command.scope === "future" && l.command.newSeriesId ? [l.key, l.command.newSeriesId] : [l.key]));
    this.snapshot = { blocks, pending, loading: this.loading > 0, error: this.error, canRetry: Boolean(this.failed) };
    this.listeners.forEach(listener => listener());
  }
  async load(range: CalendarRange, force = false): Promise<void> {
    const key = rangeKey(range), previous = this.cached.get(key);
    if (!force && previous && Date.now() - previous.at < 60000) return;
    const existing = this.reads.get(key);
    if (existing) return existing;
    const epoch = this.epoch;
    this.loading++; if (!this.failed) this.error = ""; this.emit();
    const read = (async () => {
      try {
        const response = await this.transport(`/api/calendar?from=${range.from}&to=${range.to}`, { signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error ?? "saveFailed");
        const blocks = result.blocks as ScheduleBlock[];
        for (const block of blocks) {
          const current = this.confirmed.get(block.id);
          if ((this.touched.get(block.id) ?? 0) > epoch || (current && Date.parse(block.updatedAt) < Date.parse(current.updatedAt))) continue;
          if (current) {
            const changed = block.updatedAt !== current.updatedAt;
            if (changed) for (const [otherKey, entry] of this.cached) if (otherKey !== key && entry.ids.includes(block.id)) entry.at = 0;
            // Never mix exception sets from different series revisions. Within
            // one revision, preserve only known exceptions outside this read.
            const from = Date.parse(zonedToUtc(`${range.from}T00:00`, this.timezone));
            const to = Date.parse(zonedToUtc(`${range.to}T00:00`, this.timezone));
            const fromDay = localDay(from - (Date.parse(block.endsAt) - Date.parse(block.startsAt)), block.timezone);
            const toDay = localDay(to, block.timezone);
            const retained = current.exceptions.filter(e => !changed && !(
              (e.date >= fromDay && e.date <= toDay)
              || (e.startsAt && e.endsAt && Date.parse(e.startsAt) < to && Date.parse(e.endsAt) > from)
            ));
            block.exceptions = [...new Map([...retained, ...block.exceptions].map(e => [e.date, e])).values()];
          }
          this.confirmed.set(block.id, block);
        }
        for (const id of previous?.ids ?? []) if (!blocks.some(b => b.id === id) && (this.touched.get(id) ?? 0) <= epoch && !this.layers.some(l => l.key === id)) {
          this.confirmed.delete(id);
          for (const [otherKey, entry] of this.cached) if (otherKey !== key && entry.ids.includes(id)) entry.at = 0;
        }
        this.cached.set(key, { at: Date.now(), ids: blocks.map(b => b.id) });
        if (this.cached.size > 48) this.cached.delete(this.cached.keys().next().value!);
      } catch (error) { this.error = error instanceof Error && !["TimeoutError", "AbortError"].includes(error.name) ? error.message : "saveFailed"; }
      finally { this.loading--; this.reads.delete(key); this.emit(); }
    })();
    this.reads.set(key, read);
    return read;
  }
  clearError = () => { this.error = ""; this.errorKey = undefined; this.failed = undefined; this.emit(); };
  retry = () => this.failed ? this.mutate(this.failed.command, this.failed.operationId) : Promise.resolve(false);
  mutate(command: CalendarCommand, operationId = crypto.randomUUID()): Promise<boolean> {
    const key = keyOf(command), now = new Date().toISOString();
    const duplicate = this.layers.findLast(l => l.key === key);
    if (duplicate && JSON.stringify(duplicate.command) === JSON.stringify(command)) return this.queues.get(key)!;
    // Validate the optimistic reducer before accepting the action.
    try {
      const change = applyCalendarCommand(this.snapshot.blocks.find(b => b.id === key), command, this.userId, now);
      for (const id of [...change.blocks.map(b => b.id), ...change.removed]) this.touched.set(id, ++this.epoch);
    }
    catch { this.error = "recordUnavailable"; this.emit(); return Promise.resolve(false); }
    const layer: Layer = { command, operationId, key, now };
    const finishWrite = beginWrite(this.userId);
    this.layers.push(layer); this.touched.set(key, ++this.epoch);
    if (!this.failed || this.failed.key === key) { this.error = ""; this.failed = undefined; }
    this.emit();
    const task = (this.queues.get(key) ?? Promise.resolve()).then(async () => {
      let retryable = true;
      try {
        const original = this.confirmed.get(key);
        if (command.kind !== "create" && !original) throw new Error("recordUnavailable");
        const input: CalendarMutation = { command, operationId: layer.operationId, expectedUpdatedAt: original?.updatedAt };
        let response: Response | undefined;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await this.transport("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
            if (response.status < 500 || attempt === 1) break;
          } catch (error) { if (attempt === 1) throw error; }
        }
        const result = await response!.json();
        if (!response!.ok || !result.ok) {
          retryable = response!.status >= 500;
          if (response!.status === 409 || response!.status === 404) {
            const fresh = await this.transport(`/api/calendar?id=${key}`, { signal: AbortSignal.timeout(15000) });
            const current = await fresh.json();
            if (fresh.ok && current.block) this.confirmed.set(key, current.block);
            else if (fresh.status === 404) this.confirmed.delete(key);
          }
          throw new Error(result.error ?? "saveFailed");
        }
        const change = result as CalendarChange;
        for (const block of change.blocks) {
          const current = this.confirmed.get(block.id);
          if (current && Date.parse(current.updatedAt) > Date.parse(block.updatedAt)) continue;
          this.confirmed.set(block.id, block); this.touched.set(block.id, ++this.epoch);
        }
        for (const id of change.removed) { this.confirmed.delete(id); this.touched.set(id, ++this.epoch); }
        if (this.errorKey === key) { this.error = ""; this.errorKey = undefined; this.failed = undefined; }
        finishWrite("saved");
        return true;
      } catch (error) {
        finishWrite(retryable ? "uncertain" : "failed");
        const superseded = this.layers.slice(this.layers.indexOf(layer) + 1).some(l => l.key === key);
        if (retryable && !superseded) this.failed = layer;
        this.errorKey = key;
        this.error = error instanceof Error && !["TimeoutError", "AbortError"].includes(error.name) ? error.message : "saveFailed";
        return false;
      }
      finally { this.layers = this.layers.filter(item => item !== layer); this.touched.set(key, ++this.epoch); this.emit(); }
    });
    this.queues.set(key, task);
    const child = command.kind !== "create" && command.scope === "future" ? command.newSeriesId : undefined;
    if (child) this.queues.set(child, task);
    void task.finally(() => {
      if (this.queues.get(key) === task) this.queues.delete(key);
      if (child && this.queues.get(child) === task) this.queues.delete(child);
    });
    return task;
  }
}
