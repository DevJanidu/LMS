import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  usage: vi.fn(),
  tool: vi.fn(),
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
}));
vi.mock("@/lib/aven/usage", () => ({
  reserveUsage: vi.fn(),
  finishUsage: mocks.usage,
}));
vi.mock("@/lib/aven/tools", () => ({
  avenTools: [],
  executeAvenTool: mocks.tool,
}));
import { streamChat } from "@/lib/aven/chat";
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
  expect(events.some((event) => event.type === "delta")).toBe(true);
  expect(events.at(-1)?.type).toBe("done");
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
