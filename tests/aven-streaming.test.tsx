import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
vi.mock("@/icons", async () => {
  const { readFileSync } = await import("node:fs");
  const names = [...readFileSync("src/icons/index.tsx", "utf8").matchAll(/as (\w+)/g)].map((match) => match[1]);
  const Icon = () => <span aria-hidden="true" />;
  return Object.fromEntries(names.map((name) => [name, Icon]));
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as string}</a>,
  useRouter: () => ({ push: vi.fn() }),
}));
import { createEventRelay } from "@/lib/aven/stream-relay";
import { createSequenceGuard, isStreamEvent } from "@/lib/aven/stream-protocol";
import { responseEvents } from "@/lib/aven/stream";
import { describeGeneration, holdsLease } from "@/lib/aven/generation-state";
import {
  applyUiComponent,
  parseUiComponent,
  readyComponent,
  storedComponents,
  type UiComponent,
} from "@/lib/aven/ui-components";
import { componentsFromTool, componentTypesForTool } from "@/lib/aven/ui-builders";
import { activityCategory, knownActivity } from "@/lib/aven/activity";
import { parseMarkdown, splitStable, streamingView } from "@/components/aven/markdown";
import AvenMarkdown from "@/components/aven/AvenMarkdown";
import AvenGenerativeUI from "@/components/aven/AvenGenerativeUI";
import { applySnapshot, followDelay } from "@/components/aven/useGenerationFollow";
import { reconcile } from "@/components/aven/useAvenConversation";
import { nextRevealLength } from "@/components/aven/useSmoothText";
import { StreamIdle, watchedEvents } from "@/components/aven/useAvenStream";
import type { AvenMessageRecord } from "@/components/aven/types";
const goalId = "8d0f7c56-8a51-4a9e-9a6f-2a1f5d1a7c11",
  subjectId = "5b8e2a57-1f0e-4c1b-9d62-3c4f0a7e9b21",
  topicId = "0c4f5e8a-2b7d-4f6a-8e1c-9a3b5d7f1e22",
  taskId = "7e1a3c5b-9d2f-4b6a-8c0e-1f3a5b7d9c33";
const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {node}
    </NextIntlClientProvider>,
  );
async function readAll(stream: ReadableStream<Uint8Array>) {
  const events = [];
  for await (const event of responseEvents(stream)) events.push(event);
  return events as unknown as Record<string, unknown>[];
}
describe("event relay", () => {
  it("numbers events in order and closes the stream", async () => {
    const relay = createEventRelay(60000);
    expect(relay.emit({ type: "message-start", conversationId: "c", requestId: "r" })).toBe(1);
    expect(relay.emit({ type: "text-delta", text: "Hi 世界" })).toBe(2);
    relay.close();
    relay.close();
    const events = await readAll(relay.stream);
    expect(events.map((event) => [event.type, event.seq, event.v])).toEqual([
      ["message-start", 1, 1],
      ["text-delta", 2, 1],
    ]);
    expect(events[1].text).toBe("Hi 世界");
  });
  it("keeps generating after the viewer disconnects: emit becomes a no-op, not an abort", async () => {
    const relay = createEventRelay(60000);
    relay.emit({ type: "text-delta", text: "a" });
    await relay.stream.cancel();
    expect(relay.attached).toBe(false);
    expect(() => relay.emit({ type: "text-delta", text: "b" })).not.toThrow();
    expect(relay.emit({ type: "message-complete", conversationId: "c" })).toBe(3);
    relay.close();
  });
  it("sends heartbeats so a silent connection can be detected", async () => {
    vi.useFakeTimers();
    const relay = createEventRelay(1000);
    const reader = relay.stream.getReader();
    vi.advanceTimersByTime(2100);
    relay.close();
    vi.useRealTimers();
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(chunks.join("").match(/"type":"heartbeat"/g)).toHaveLength(2);
  });
});
describe("stream protocol", () => {
  it("drops duplicate and out-of-order events", () => {
    const guard = createSequenceGuard();
    expect([1, 2, 2, 1, 4, 3, 5].map((seq) => guard.accept(seq))).toEqual([
      true, true, false, false, true, false, true,
    ]);
    expect(guard.last).toBe(5);
  });
  it("rejects malformed or unknown events", () => {
    expect(isStreamEvent({ type: "text-delta", text: "x", seq: 1 })).toBe(true);
    expect(isStreamEvent({ type: "text-delta", text: "x" })).toBe(false);
    expect(isStreamEvent({ type: "execute", seq: 2 })).toBe(false);
    expect(isStreamEvent({ type: "heartbeat", seq: 0 })).toBe(false);
    expect(isStreamEvent(null)).toBe(false);
  });
  it("maps tools to user-safe categories only", () => {
    expect(activityCategory("getCalendar")).toBe("calendar");
    expect(activityCategory("auditTopicCoverage")).toBe("resources");
    expect(activityCategory("someWriteTool")).toBe("changes");
    expect(knownActivity("<script>")).toBe("working");
  });
  it("treats a connection without bytes as dead instead of waiting forever", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(sink) {
        sink.enqueue(new TextEncoder().encode('data: {"type":"text-delta","text":"Hi","seq":1}\n\n'));
        controller.signal.addEventListener("abort", () => sink.error(new DOMException("aborted", "AbortError")));
      },
    });
    const received: string[] = [];
    await expect(async () => {
      for await (const event of watchedEvents(body, controller, 50))
        received.push(event.type);
    }).rejects.toBeInstanceOf(StreamIdle);
    expect(received).toEqual(["text-delta"]);
  });
});
describe("durable generation state", () => {
  const future = new Date(Date.now() + 60000),
    past = new Date(Date.now() - 1000);
  const row = (status: string, context: Record<string, string> = {}, content = "") => ({
    requestId: "r1",
    status,
    content,
    context,
    createdAt: new Date(),
  });
  it("reports queued and running only while this request holds a live lease", () => {
    const lease = { activeRequestId: "r1", lockedUntil: future };
    expect(describeGeneration(row("streaming", { phase: "queued", seq: "0" }), lease, 0).status).toBe("queued");
    const running = describeGeneration(row("streaming", { phase: "running", seq: "14", activity: "calendar" }, "Partial"), lease, 0);
    expect(running).toMatchObject({ status: "running", seq: 14, activity: "calendar", content: "Partial" });
    expect(holdsLease(lease, "other")).toBe(false);
  });
  it("detects stale jobs: an expired lease means the run was interrupted, never 'generating' forever", () => {
    const stale = describeGeneration(row("streaming", { phase: "running" }), { activeRequestId: "r1", lockedUntil: past }, 0);
    expect(stale).toMatchObject({ status: "failed", errorCode: "generationInterrupted", activity: null });
    const taken = describeGeneration(row("streaming"), { activeRequestId: "r2", lockedUntil: future }, 0);
    expect(taken.status).toBe("failed");
  });
  it("maps terminal rows, including approval waits", () => {
    const idle = { activeRequestId: null, lockedUntil: null };
    expect(describeGeneration(row("complete"), idle, 0).status).toBe("completed");
    expect(describeGeneration(row("complete"), idle, 2).status).toBe("waiting_for_approval");
    expect(describeGeneration(row("cancelled"), idle, 0).status).toBe("cancelled");
    expect(describeGeneration(row("error", {}, "aiUnavailable"), idle, 0)).toMatchObject({ status: "failed", errorCode: "aiUnavailable" });
  });
});
const goalCard = { id: goalId, title: "Java", status: "active", targetDate: null, percent: 50, health: "onTrack", daysRemaining: 3, remainingMilestones: [], nextTask: null };
describe("generative UI registry", () => {
  it("accepts only approved, valid, renderable components", () => {
    expect(parseUiComponent({ id: "g", type: "goal_progress", version: 1, status: "ready", data: { goals: [goalCard] } })).toMatchObject({ status: "ready" });
    expect(parseUiComponent({ id: "x", type: "raw_html", version: 1, status: "ready", data: "<script>" })).toBeNull();
    expect(parseUiComponent({ id: "g", type: "goal_progress", version: 99, status: "ready", data: { goals: [goalCard] } })).toBeNull();
    expect(parseUiComponent({ id: "g", type: "goal_progress", version: 1, status: "ready", data: { goals: [{ ...goalCard, id: "not-a-uuid" }] } })).toBeNull();
    expect(parseUiComponent({ id: "g", type: "study_analytics", version: 1, status: "ready", data: { periodDays: 7 } })).toBeNull();
    // A placeholder never carries data that could be mistaken for confirmed records.
    expect(parseUiComponent({ id: "t", type: "task_list", version: 1, status: "loading", data: { invented: true } })).toEqual({ id: "t", type: "task_list", version: 1, status: "loading" });
  });
  it("migrates cards saved before the registry existed", () => {
    const legacy = storedComponents({ goalCards: JSON.stringify([goalCard]) });
    expect(legacy).toMatchObject([{ type: "goal_progress", version: 1, data: { goals: [{ id: goalId }] } }]);
    expect(storedComponents({ components: "not json" })).toEqual([]);
    expect(storedComponents(null)).toEqual([]);
  });
  it("updates slots in place, ignores late placeholders and withdraws empty ones", () => {
    const loading: UiComponent = { id: "goal_progress", type: "goal_progress", version: 1, status: "loading" };
    const ready = readyComponent("goal_progress", { goals: [goalCard] })!;
    const other: UiComponent = { id: "task_list", type: "task_list", version: 1, status: "loading" };
    let list = applyUiComponent([], loading);
    list = applyUiComponent(list, other);
    list = applyUiComponent(list, ready);
    expect(list.map((item) => [item.id, item.status])).toEqual([["goal_progress", "ready"], ["task_list", "loading"]]);
    expect(applyUiComponent(list, loading)).toBe(list);
    expect(applyUiComponent(list, { ...other, status: "removed" }).map((item) => item.id)).toEqual(["goal_progress"]);
  });
  it("builds cards only from verified tool output", () => {
    const goals = new Map();
    expect(componentTypesForTool("getGoalDetails")).toEqual(["goal_progress", "task_list"]);
    expect(componentsFromTool("getWeeklyAnalytics", { error: "toolUnavailable" }, goals)).toEqual([]);
    const analytics = componentsFromTool("getWeeklyAnalytics", {
      period: { from: new Date(Date.now() - 7 * 864e5).toISOString(), to: new Date().toISOString() },
      summary: { hours: 2.5, count: 4 },
      previousWeek: { hours: 0, count: 0, comparable: false },
    }, goals);
    expect(analytics[0]).toMatchObject({ type: "study_analytics", data: { periodDays: 7, minutes: 150, sessions: 4, previous: null } });
    const coverage = componentsFromTool("auditTopicCoverage", {
      subject: { id: subjectId, title: "Java" },
      counts: { required: 3, completed: 1, remaining: 2, inProgress: 1, overdue: 1 },
      overdue: [{ id: topicId, title: "Streams", targetDate: "2026-10-01" }],
      topics: [{ id: topicId, title: "Streams", targetDate: "2026-10-01", completed: false }],
    }, goals);
    expect(coverage[0]).toMatchObject({ type: "topic_coverage", data: { counts: { completed: 1 }, nextTopics: [{ id: topicId }] } });
    const tasks = componentsFromTool("getGoalDetails", {
      goal: { id: goalId, title: "Java", status: "active", targetDate: null },
      progress: { percent: 10, health: "atRisk", daysRemaining: 5, milestoneProgress: {} },
      milestones: [],
      tasks: [
        { id: taskId, title: "Read chapter", status: "todo", priority: "high", dueDate: "2020-01-01" },
        { id: crypto.randomUUID(), title: "Done", status: "completed", priority: "normal", dueDate: null },
      ],
    }, goals);
    expect(tasks.map((item) => item.type)).toEqual(["goal_progress", "task_list"]);
    expect(tasks[1]).toMatchObject({ data: { remaining: 1, tasks: [{ id: taskId, overdue: true }] } });
    const circles = componentsFromTool("getStudyCircles", {
      weekEndsAt: new Date().toISOString(),
      me: { friendsRank: 2, verifiedMinutesThisWeek: 90, minutesBehindNextRank: 15 },
      friendsLeaderboard: [{ rank: 1, name: "Sam", verifiedMinutes: 105 }, { rank: 2, name: "You", verifiedMinutes: 90 }],
    }, goals);
    expect(circles[0]).toMatchObject({ type: "circle_leaderboard", data: { rows: [{ me: false }, { me: true }] } });
  });
  it("renders a placeholder without data, then the validated card", () => {
    const loading = html(<AvenGenerativeUI components={[{ id: "topic_coverage", type: "topic_coverage", version: 1, status: "loading" }]} />);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain(en.aven.cards.loadingCard);
    const card = readyComponent("study_analytics", { periodDays: 7, minutes: 150, sessions: 4, previous: { minutes: 60, sessions: 2 } })!;
    const ready = html(<AvenGenerativeUI components={[card]} />);
    expect(ready).toContain("2 h 30 min");
    expect(ready).toContain("+1 h 30 min");
    expect(ready).not.toContain("aria-busy");
  });
});
describe("streaming Markdown", () => {
  it("parses nested lists and checklists", () => {
    const [list] = parseMarkdown("- Week 1\n  - Streams\n  - [x] Lambdas\n- [ ] Week 2");
    expect(list).toMatchObject({
      kind: "list",
      items: [
        { text: "Week 1", children: [{ text: "Streams", checked: null }, { text: "Lambdas", checked: true }] },
        { text: "Week 2", checked: false },
      ],
    });
  });
  it("holds a half-written table instead of flashing pipes", () => {
    expect(streamingView("Plan:\n| Day | Task |")).toBe("Plan:");
    expect(streamingView("Plan:\n| Day | Task |\n| --- | --- |\n| Mon | Re")).toBe("Plan:\n| Day | Task |\n| --- | --- |");
    const blocks = parseMarkdown(streamingView("| Day | Task |\n| --- | --- |\n| Mon | Read |\n"));
    expect(blocks[0]).toMatchObject({ kind: "table", rows: [["Mon", "Read"]] });
  });
  it("closes unmatched inline markers on the line still arriving", () => {
    expect(streamingView("This is **impor")).toBe("This is **impor**");
    expect(streamingView("Run `npm te")).toBe("Run `npm te`");
    expect(streamingView("A *subtle")).toBe("A *subtle*");
    expect(streamingView("```js\nconst a = '**'")).toBe("```js\nconst a = '**'");
  });
  it("stabilises a heading once its line is complete and keeps unclosed fences as code", () => {
    expect(parseMarkdown("## Week")[0]).toMatchObject({ kind: "heading", text: "Week" });
    expect(parseMarkdown("Intro\n```js\nlet x").at(-1)).toMatchObject({ kind: "code", open: true });
  });
  it("splits off a stable prefix but never inside a code fence", () => {
    expect(splitStable("One.\n\nTwo.\n\nThr")).toEqual(["One.\n\nTwo.", "Thr"]);
    expect(splitStable("```\na\n\nb")).toEqual(["", "```\na\n\nb"]);
  });
  it("renders untrusted HTML and script links as inert text", () => {
    const markup = html(
      <AvenMarkdown text={'<img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://example.com) [goal](/goals/1)'} />,
    );
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("javascript:");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('rel="noopener noreferrer nofollow"');
    expect(markup).toContain('href="/goals/1"');
  });
  it("shows a streaming caret marker only while streaming", () => {
    expect(html(<AvenMarkdown text="Hello" streaming />)).toContain("data-streaming");
    expect(html(<AvenMarkdown text="Hello" />)).not.toContain("data-streaming");
  });
});
describe("recovery reconciliation", () => {
  const streaming = (content: string, seq: number): AvenMessageRecord => ({
    id: "a", requestId: "r1", role: "assistant", content, status: "streaming", seq,
  });
  const snapshot = (content: string, seq: number) =>
    describeGeneration(
      { requestId: "r1", status: "streaming", content, context: { phase: "running", seq: String(seq) }, createdAt: new Date() },
      { activeRequestId: "r1", lockedUntil: new Date(Date.now() + 60000) },
      0,
    );
  it("applies a newer snapshot and ignores stale ones, so text is never duplicated or rolled back", () => {
    const messages = [streaming("Hello wor", 9)];
    expect(applySnapshot(messages, snapshot("Hello", 5))).toBe(messages);
    expect(applySnapshot(messages, snapshot("Hello world, here", 12))[0]).toMatchObject({ content: "Hello world, here", seq: 12 });
  });
  it("keeps a live reply when a refresh returns an older snapshot", () => {
    const live = [streaming("Hello world", 12)];
    const saved = [{ ...streaming("Hello", 0), seq: undefined, context: { seq: "6" } }];
    expect(reconcile(live, saved)[0]).toBe(live[0]);
    const completed = [{ id: "a", requestId: "r1", role: "assistant", content: "Hello world!", status: "complete" }];
    expect(reconcile(live, completed)[0]).toMatchObject({ status: "complete" });
  });
  it("backs off polling on failures", () => {
    expect([0, 1, 2, 3, 9].map(followDelay)).toEqual([1000, 2000, 4000, 8000, 10000]);
  });
  it("paces only text that already arrived and never splits surrogate pairs", () => {
    expect(nextRevealLength("abc", 3, 16)).toBe(3);
    expect(nextRevealLength("a".repeat(100), 0, 1000)).toBe(100);
    const emoji = "ab😀cd";
    const next = nextRevealLength(emoji, 2, 1);
    expect(emoji.slice(0, next)).not.toMatch(/[\uD800-\uDBFF]$/);
  });
});
