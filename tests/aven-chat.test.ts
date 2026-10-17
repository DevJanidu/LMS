vi.mock("@/lib/aven/access", () => ({
  assertAvenAccess: vi.fn().mockResolvedValue(undefined),
  assertConversationActive: vi.fn().mockResolvedValue(undefined),
  assertTurnActive: vi.fn().mockResolvedValue(undefined),
}));
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  keep: vi.fn(),
  usage: vi.fn(),
  tool: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/aven/preferences", () => ({ getAvenPreferences: vi.fn() }));
vi.mock("@/lib/aven/conversations", () => ({
  beginConversationTurn: vi.fn(),
  finishConversationTurn: mocks.finish,
  keepStoppedAnswer: mocks.keep,
  saveStreamingSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/aven/usage", () => ({
  reserveUsage: vi.fn(),
  finishUsage: mocks.usage,
}));
vi.mock("@/lib/aven/tools", () => ({
  avenTools: [],
  executeAvenTool: mocks.tool,
  isAvenWriteTool: (name: string) => name.startsWith("create"),
}));
import { streamChat } from "@/lib/aven/chat";
import { assertAvenAccess, assertTurnActive } from "@/lib/aven/access";
type Prepared = Parameters<typeof streamChat>[2];
const prepared = {
  preferences: { ai: { consent: true, locale: "en" }, memory: [] },
  reservation: {
    id: "reservation",
    config: { key: "test-key", model: "test-model" },
  },
  conversation: {
    id: "conversation",
    goalId: null,
    summary: "",
    summaryMessageCount: 0,
    messageCount: 1,
    history: [{ role: "user", content: "Help me plan" }],
  },
} as unknown as Prepared;
const input = {
  requestId: "request",
  conversationId: null,
  goalId: null,
  message: "Help me plan",
  planning: true,
};
const completed = (output: unknown[], text?: string) =>
  new Response(
    (text
      ? `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`
      : "") +
      `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 10, output_tokens: 20 } } })}\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.finish.mockResolvedValue(undefined);
  mocks.usage.mockResolvedValue(undefined);
  mocks.snapshot.mockResolvedValue(true);
  vi.mocked(assertAvenAccess).mockResolvedValue(undefined);
  vi.mocked(assertTurnActive).mockResolvedValue(undefined);
});
it("terminates an empty successful provider stream with a retryable saved error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completed([])));
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(events.at(-1)).toMatchObject({ type: "error", code: "emptyResponse" });
  expect(events.some((event) => event.type === "done")).toBe(false);
});
it("never emits success when the conversation persistence fence rejects a late answer", async () => {
  mocks.finish.mockResolvedValue(false);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(completed([], "Late answer")),
  );
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(events.at(-1)).toMatchObject({
    type: "error",
    code: "conversationUnavailable",
  });
});
it("persists timed-out generation as cancelled and ends the stream", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("Timeout", "TimeoutError"));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(controller.signal.reason));
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    controller.signal,
  );
  expect(events.at(-1)).toMatchObject({
    type: "error",
    code: "generationTimedOut",
  });
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "generationTimedOut",
    "cancelled",
  );
});
it("does not transmit another provider request after live consent is revoked", async () => {
  vi.mocked(assertTurnActive).mockRejectedValue(new Error("revoked"));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await streamChat(
    "owner",
    input,
    prepared,
    () => {},
    new AbortController().signal,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.finish).toHaveBeenCalled();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it("streams text, persists the assistant reply and accounts for actual usage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(completed([], "A concrete next step.")),
  );
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(events.some((event) => event.type === "text-delta")).toBe(true);
  expect(events.at(-1)?.type).toBe("message-complete");
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "A concrete next step.",
    "complete",
    undefined,
    1,
  );
  expect(mocks.usage).toHaveBeenCalledWith("reservation", 10, 20, true, false);
});
it("creates a pending proposal without running an approval operation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      completed([
        {
          type: "function_call",
          name: "createGoalTask",
          arguments: '{"goalId":"owned-goal"}',
          call_id: "call",
        },
      ]),
    )
    .mockResolvedValueOnce(completed([], "Review the proposed task."));
  vi.stubGlobal("fetch", fetch);
  mocks.tool.mockResolvedValue({
    id: "proposal",
    status: "pending",
    value: { kind: "taskCreate" },
  });
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(mocks.tool).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "createGoalTask",
    { goalId: "owned-goal" },
  );
  expect(events.some((event) => event.type === "proposal")).toBe(true);
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.instructions).toContain("proposals ONLY");
  expect(body.store).toBe(false);
});
it("buffers a pending action reply and uses a real correction request before exposing an execution claim", async () => {
  const corrected = "I prepared a goal proposal. Review the approval card.";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        completed([
          {
            type: "function_call",
            name: "createGoalTask",
            arguments: "{}",
            call_id: "call",
          },
        ]),
      )
      .mockResolvedValueOnce(completed([], "I created a goal for you."))
      .mockResolvedValueOnce(
        completed(
          [
            {
              type: "message",
              content: [{ type: "output_text", text: corrected }],
            },
          ],
          corrected,
        ),
      ),
  );
  mocks.tool.mockResolvedValue({
    id: "proposal",
    status: "pending",
    value: { kind: "taskCreate" },
  });
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(
    events.some(
      (event) =>
        event.type === "text-delta" && String(event.text).includes("I created"),
    ),
  ).toBe(false);
  expect(events).toContainEqual(expect.objectContaining({ type: "text-replace", text: corrected }));
  expect(events.at(-1)?.type).toBe("message-complete");
});
it("persists failures and retains conservative reservations only for uncertain upstream usage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
  );
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(events.at(-1)?.type).toBe("error");
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "aiUnavailable",
    "error",
  );
  expect(mocks.usage).toHaveBeenCalledWith("reservation", 0, 0, true, true);
});
it("releases unused reservations for a known rejected upstream request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
  );
  await streamChat(
    "owner",
    input,
    prepared,
    () => {},
    new AbortController().signal,
  );
  expect(mocks.usage).toHaveBeenCalledWith("reservation", 0, 0, true, false);
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "aiKeyInvalid",
    "error",
  );
});
it("preserves a valid response if optional summarization fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(completed([], "Your progress is ready."))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 })),
  );
  await streamChat(
    "owner",
    input,
    {
      ...prepared,
      conversation: { ...prepared.conversation, messageCount: 30 },
    },
    () => {},
    new AbortController().signal,
  );
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "Your progress is ready.",
    "complete",
    undefined,
    30,
  );
});
it("emits server-built goal progress cards and saves them with the reply", async () => {
  const goalId = "8d0f7c56-8a51-4a9e-9a6f-2a1f5d1a7c11";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        completed([
          {
            type: "function_call",
            name: "getGoalDetails",
            arguments: JSON.stringify({ goalId }),
            call_id: "call",
          },
        ]),
      )
      .mockResolvedValueOnce(completed([], "You are on track.")),
  );
  mocks.tool.mockResolvedValue({
    goal: { id: goalId, title: "Java", status: "active", targetDate: null },
    milestones: [],
    tasks: [],
    progress: {
      percent: 50,
      health: "onTrack",
      daysRemaining: 3,
      milestoneProgress: {},
    },
  });
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  // A placeholder holds the card's slot while the tool runs, then the validated card replaces it.
  const cards = events.filter((event) => event.type === "ui-component");
  expect(cards[0]).toMatchObject({
    component: { id: "goal_progress", status: "loading" },
  });
  expect(
    cards.find(
      (event) => (event.component as { status: string }).status === "ready",
    ),
  ).toMatchObject({
    component: {
      id: "goal_progress",
      type: "goal_progress",
      version: 1,
      status: "ready",
      data: { goals: [{ id: goalId, title: "Java", percent: 50 }] },
    },
  });
  // No open tasks: the task list placeholder is withdrawn, never left loading or invented.
  expect(cards).toContainEqual(
    expect.objectContaining({
      component: expect.objectContaining({ id: "task_list", status: "removed" }),
    }),
  );
  const context = mocks.finish.mock.calls.at(-1)?.[7] as {
    components: string;
  };
  expect(JSON.parse(context.components)).toMatchObject([
    { type: "goal_progress", data: { goals: [{ id: goalId }] } },
  ]);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "tool-start", activity: "goals" }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ type: "tool-result", activity: "goals", ok: true }),
  );
  expect(events.at(-1)).toMatchObject({ type: "message-complete" });
});
it("keeps a partial reply when the stop endpoint closed the turn first", async () => {
  mocks.finish.mockResolvedValue(false);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(completed([], "Partial answer")),
  );
  await streamChat(
    "owner",
    input,
    prepared,
    () => {},
    new AbortController().signal,
  );
  expect(mocks.keep).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "Partial answer",
  );
});
const luna = {
  ...prepared,
  reservation: {
    id: "reservation",
    config: {
      key: "test-key",
      model: "gpt-6-luna",
      reasoningEffort: "medium",
      maxOutputTokens: 25000,
    },
  },
  planning: true,
  intent: { intents: ["goal"], multiPart: true, planning: true },
  goals: [
    { id: "g", title: "Java", targetDate: "2026-12-01", status: "active" },
  ],
} as unknown as Prepared;
it("sends GPT-6 reasoning settings, the output budget and turn guidance", async () => {
  const fetch = vi.fn().mockResolvedValue(completed([], "A plan."));
  vi.stubGlobal("fetch", fetch);
  await streamChat(
    "owner",
    input,
    luna,
    () => {},
    new AbortController().signal,
  );
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.model).toBe("gpt-6-luna");
  expect(body.reasoning).toEqual({ effort: "medium" });
  expect(body.max_output_tokens).toBe(25000);
  expect(body.store).toBe(false);
  expect(body.instructions).toContain("proposeGoalHierarchy");
  expect(body.instructions).toContain('"title":"Java"');
});
it("classifies an exhausted output budget separately from provider outages", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          `data: ${JSON.stringify({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } })}\n\n`,
        ),
      ),
  );
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    luna,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(events.at(-1)).toMatchObject({ type: "error", code: "aiOutputLimit" });
});
it("retries one transient provider failure, then gives up without looping", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 503 }))
    .mockResolvedValueOnce(completed([], "Recovered."));
  vi.stubGlobal("fetch", fetch);
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    luna,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(events.at(-1)).toMatchObject({ type: "message-complete" });
  const failing = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", failing);
  const failed: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    luna,
    (event) => failed.push(event),
    new AbortController().signal,
  );
  expect(failing).toHaveBeenCalledTimes(2);
  expect(failed.at(-1)).toMatchObject({ type: "error", code: "aiUnavailable" });
});

it("keeps generating and saves the reply after the viewer's stream is cancelled", async () => {
  const { createEventRelay } = await import("@/lib/aven/stream-relay");
  const relay = createEventRelay(60000);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(completed([], "Saved even though nobody watched.")),
  );
  // The browser navigated away before the reply started.
  await relay.stream.cancel();
  await streamChat("owner", input, prepared, relay.emit, new AbortController().signal);
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "Saved even though nobody watched.",
    "complete",
    undefined,
    1,
  );
  // Recovery snapshots carry the stream sequence they include.
  expect(mocks.snapshot).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "",
    expect.objectContaining({ phase: "running", seq: "1" }),
  );
});
it("stops promptly when the lease is lost (stopped from another tab) and keeps the text", async () => {
  mocks.snapshot.mockResolvedValue(false);
  const encoder = new TextEncoder();
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: { signal: AbortSignal }) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(sink) {
              sink.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Partial" })}\n\n`,
                ),
              );
              // The provider keeps streaming until the generation is aborted.
              init.signal.addEventListener("abort", () => sink.error(init.signal.reason));
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    ),
  );
  const events: Record<string, unknown>[] = [];
  await streamChat(
    "owner",
    input,
    prepared,
    (event) => events.push(event),
    new AbortController().signal,
  );
  expect(events.at(-1)).toMatchObject({ type: "error", code: "generationStopped" });
  expect(mocks.finish).toHaveBeenCalledWith(
    "owner",
    "conversation",
    "request",
    "Partial",
    "cancelled",
  );
});