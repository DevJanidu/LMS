import type { Workspace } from "@/types";
import type { Operation } from "@/lib/validation/operations";
import { editedSessionInterval } from "@/lib/timer/session-edit";

export function blockAfterDeletion(block: Workspace["blocks"][number], operation: Extract<Operation, { kind: "delete" }>): Workspace["blocks"][number] | undefined {
  const { entity, id } = operation;
  if ((entity === "block" && block.id === id) || (entity === "subject" && block.subjectId === id)) return undefined;
  if (entity === "subject") return { ...block, exceptions: block.exceptions.filter(exception => exception.subjectId !== id && exception.overrides?.subjectId !== id) };
  if (entity === "topic") return { ...block, topicId: block.topicId === id ? undefined : block.topicId,
    exceptions: block.exceptions.map(exception => ({ ...exception, topicId: exception.topicId === id ? undefined : exception.topicId,
      overrides: exception.overrides?.topicId === id ? { ...exception.overrides, topicId: null } : exception.overrides })),
  };
  return block;
}

/** Stable keys are shared by pending controls, serialization and query invalidation. */
export function mutationKeys(operations: Operation[], data?: Workspace): string[] {
  const relationships = (entity: string, id: string) => {
    const fields = { subject: "subjects", topic: "topics", resource: "resources", session: "sessions", block: "blocks" } as const;
    const field = fields[entity as keyof typeof fields];
    const row = field ? data?.[field].find(item => item.id === id) : undefined;
    return row ? [
      ...("subjectId" in row && row.subjectId ? [`subject:${row.subjectId}`] : []),
      ...("topicId" in row && row.topicId ? [`topic:${row.topicId}`] : []),
    ] : [];
  };
  return [...new Set(operations.flatMap(operation => {
    if (operation.kind === "delete") return [`${operation.entity}:${operation.id}`, ...relationships(operation.entity, operation.id),
      ...(operation.entity === "subject" && data?.timer?.subjectId === operation.id ? ["timer"] : []),
      ...(operation.entity === "topic" && data?.timer?.topicId === operation.id ? ["timer"] : [])];
    if (operation.kind === "timer") {
      const timer = operation.value.command === "start" ? operation.value : data?.timer;
      return ["timer", ...(timer?.subjectId ? [`subject:${timer.subjectId}`] : []), ...(timer?.topicId ? [`topic:${timer.topicId}`] : [])];
    }
    if ("value" in operation && "id" in operation.value) {
      const keys = [`${operation.kind}:${operation.value.id}`, ...relationships(operation.kind, operation.value.id)];
      if ("subjectId" in operation.value && operation.value.subjectId) keys.push(`subject:${operation.value.subjectId}`);
      if ("topicId" in operation.value && operation.value.topicId) keys.push(`topic:${operation.value.topicId}`);
      return keys;
    }
    return ["id" in operation ? `${operation.kind}:${operation.id}` : operation.kind];
  }))];
}

/** Operations replay over confirmed state, so one failure cannot undo another record's save. */
export function optimisticOperations(data: Workspace, operations: Operation[], now = Date.now()): Workspace {
  let next = data;
  const timestamp = new Date(now).toISOString();
  for (const operation of operations) {
    switch (operation.kind) {
      case "subject": case "topic": case "resource": case "session": case "block": {
        const field = ({ subject: "subjects", topic: "topics", resource: "resources", session: "sessions", block: "blocks" } as const)[operation.kind];
        const rows = next[field] as Array<{ id: string }>;
        const old = rows.find(row => row.id === operation.value.id);
        const session = operation.kind === "session" ? next.sessions.find(row => row.id === operation.value.id) : undefined;
        const derived = operation.kind === "session" ? {
          ...editedSessionInterval(session ? { ...session, startedAt: new Date(session.startedAt), endedAt: new Date(session.endedAt) } : undefined, operation.value.startedAt, operation.value.endedAt),
          status: "valid",
        } : {};
        const value = { createdAt: timestamp, updatedAt: timestamp, userId: data.user.id, ...old, ...operation.value, ...derived };
        next = { ...next, [field]: old ? rows.map(row => row.id === value.id ? value : row) : [...rows, value] };
        break;
      }
      case "delete": {
        const { entity, id } = operation;
        const field = ({ subject: "subjects", topic: "topics", resource: "resources", session: "sessions", block: "blocks" } as const)[entity];
        next = { ...next, [field]: next[field].filter(row => row.id !== id) };
        if (entity === "subject") next = { ...next,
          topics: next.topics.filter(row => row.subjectId !== id), resources: next.resources.filter(row => row.subjectId !== id),
          sessions: next.sessions.filter(row => row.subjectId !== id),
          blocks: next.blocks.flatMap(row => { const value = blockAfterDeletion(row, operation); return value ? [value] : []; }),
          timer: next.timer?.subjectId === id ? null : next.timer };
        if (entity === "topic") next = { ...next,
          resources: next.resources.map(row => row.topicId === id ? { ...row, topicId: undefined } : row),
          sessions: next.sessions.map(row => row.topicId === id ? { ...row, topicId: undefined } : row),
          blocks: next.blocks.map(row => blockAfterDeletion(row, operation)!),
          timer: next.timer?.topicId === id ? { ...next.timer, topicId: undefined } : next.timer };
        break;
      }
      // Account revisions are issued by the server, never by the browser clock.
      case "profile": next = { ...next, user: { ...next.user, ...operation.value, updatedAt: next.user.updatedAt } }; break;
      case "settings": next = { ...next, settings: operation.value }; break;
      case "userStatus": next = { ...next, users: next.users.map(user => user.id === operation.id ? { ...user, status: operation.status } : user) }; break;
      case "readNotification": next = { ...next, notifications: next.notifications.map(row => row.id === operation.id ? { ...row, readAt: timestamp } : row) }; break;
      case "timer": {
        const timer = next.timer, command = operation.value;
        if (command.command === "start") next = { ...next, timer: { subjectId: command.subjectId, topicId: command.topicId, focusGoal: command.focusGoal, startedAt: timestamp, pausedTotalSeconds: 0, confirmedUntilSeconds: 21600 } };
        else if (command.command === "pause" && timer) next = { ...next, timer: { ...timer, pausedAt: timer.pausedAt ?? timestamp } };
        else if (command.command === "resume" && timer) next = { ...next, timer: { ...timer, pausedAt: undefined, pausedTotalSeconds: timer.pausedTotalSeconds + (timer.pausedAt ? Math.max(0, Math.floor((now - Date.parse(timer.pausedAt)) / 1000)) : 0) } };
        else if (command.command === "discard") next = { ...next, timer: null };
        // Finish/confirm require the server's elapsed-time calculation.
        break;
      }
    }
  }
  // Topic completion/progress is cheap and must update immediately on dependent cards.
  if (operations.some(operation => operation.kind === "topic" || (operation.kind === "delete" && operation.entity === "topic"))) {
    const statistics = { ...next.subjectStatistics };
    for (const subject of next.subjects) {
      const topics = next.topics.filter(topic => topic.subjectId === subject.id && !topic.archived);
      const completed = topics.filter(topic => topic.status === "completed").length;
      statistics[subject.id] = { ...(statistics[subject.id] ?? { seconds: 0, sessions: 0 }), total: topics.length, completed, progress: topics.length ? Math.round(completed / topics.length * 100) : 0 };
    }
    next = { ...next, subjectStatistics: statistics };
  }
  // loadedAt describes a server read, not the browser clock or an optimistic edit.
  return next;
}

/** A small reusable journal: unrelated keys execute concurrently; shared keys stay ordered. */
export class MutationJournal<T> {
  private base: T;
  private layers: Array<{ id: number; keys: string[]; apply: (data: T) => T }> = [];
  private queues = new Map<string, Promise<unknown>>();
  private sequence = 0;
  constructor(initial: T, private notify: (data: T) => void) { this.base = initial; }
  get value() { return this.layers.reduce((data, layer) => layer.apply(data), this.base); }
  get confirmed() { return this.base; }
  pending(prefix?: string) { return this.layers.some(layer => !prefix || layer.keys.some(key => key === prefix || key.startsWith(`${prefix}:`))); }
  replace(merge: (current: T) => T) { this.base = merge(this.base); this.notify(this.value); }
  async flush() { await Promise.allSettled([...this.queues.values()]); }
  submit<R>(keys: string[], apply: (data: T) => T, send: () => Promise<R>, accepted: (result: R) => boolean, reconcile?: (data: T, result: R) => T): Promise<R> {
    const layer = { id: ++this.sequence, keys, apply };
    this.layers.push(layer); this.notify(this.value);
    const dependencies = [...new Set(keys.flatMap(key => this.queues.has(key) ? [this.queues.get(key)!] : []))];
    const task = Promise.allSettled(dependencies).then(async () => {
      try {
        const result = await send();
        if (accepted(result)) this.base = reconcile ? reconcile(apply(this.base), result) : apply(this.base);
        return result;
      } finally {
        this.layers = this.layers.filter(item => item.id !== layer.id);
        for (const key of keys) if (this.queues.get(key) === task) this.queues.delete(key);
        this.notify(this.value);
      }
    });
    for (const key of keys) this.queues.set(key, task);
    return task;
  }
}
