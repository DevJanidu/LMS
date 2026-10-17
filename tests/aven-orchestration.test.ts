import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const names = [
    "getUserProfile", "getSubjects", "getUserGoals", "getCalendar", "createStudySchedule",
    "proposeStudySchedule", "proposePracticeSessions", "moveStudySessions", "cancelStudySessions",
    "rescheduleStudySession", "getStudySchedule", "getGoalDetails", "getTopics", "auditTopicCoverage",
    "getStudyCircles", "completeGoal", "organizeLearningResource", "getWeeklyAnalytics",
  ];
  // A chainable stand-in for the compact goals query in prepareChat.
  const chain = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, property) =>
        property === "then"
          ? (resolve: (value: unknown[]) => void) => resolve([])
          : property === "catch"
            ? () => Promise.resolve([])
            : () => chain(),
    });
  return {
    tools: names.map((name) => ({ type: "function", name, strict: true, description: name, parameters: {} })),
    chain,
    preferences: vi.fn(),
    reserve: vi.fn(),
    begin: vi.fn(),
    finish: vi.fn(),
    usage: vi.fn(),
    tool: vi.fn(),
    resolve: vi.fn(),
    stored: vi.fn(),
  };
});
vi.mock("@/lib/aven/access", () => ({
  assertAvenAccess: vi.fn().mockResolvedValue(undefined),
  assertConversationActive: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: () => mocks.chain() }) }));
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
}));
vi.mock("@/lib/aven/preferences", () => ({ getAvenPreferences: mocks.preferences }));
vi.mock("@/lib/aven/conversations", () => ({
  beginConversationTurn: mocks.begin,
  storedReferences: mocks.stored,
  finishConversationTurn: mocks.finish,
  keepStoppedAnswer: vi.fn(),
  saveStreamingSnapshot: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/aven/usage", () => ({ reserveUsage: mocks.reserve, finishUsage: mocks.usage }));
vi.mock("@/lib/aven/tools", () => ({
  avenTools: mocks.tools,
  executeAvenTool: mocks.tool,
  isAvenWriteTool: (name: string) => /^(create|propose|move|cancel|complete|organize|reschedule)/.test(name),
}));
vi.mock("@/lib/aven/mentions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aven/mentions")>("@/lib/aven/mentions");
  return { ...actual, resolveMentions: mocks.resolve };
});
import { prepareChat, streamChat } from "@/lib/aven/chat";
const SUBJECT = "00000000-0000-4000-8000-000000000501";
const conversation = {
  id: "conversation",
  goalId: null,
  summary: "",
  summaryMessageCount: 0,
  messageCount: 1,
  history: [{ role: "user", content: "x" }],
};
const input = (message: string, references: { type: "subject"; id: string }[] = []) => ({
  requestId: "00000000-0000-4000-8000-000000000900",
  conversationId: null,
  goalId: null,
  message,
  planning: false,
  references,
});
const stream = (output: unknown[], text?: string) =>
  new Response(
    (text ? `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n` : "") +
      `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 10, output_tokens: 5 } } })}\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences.mockResolvedValue({
    ai: { consent: true, locale: "en" },
    memory: [],
    timezone: "UTC",
  });
  mocks.reserve.mockResolvedValue({ id: "reservation", config: { key: "k", model: "m" } });
  mocks.begin.mockResolvedValue(conversation);
  mocks.finish.mockResolvedValue(undefined);
  mocks.usage.mockResolvedValue(undefined);
  mocks.resolve.mockResolvedValue({
    resolved: [{ type: "subject", id: SUBJECT, label: "Advanced Java", detail: "active" }],
    unavailable: [],
  });
});
const bodies = () =>
  vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("prepareChat orchestration", () => {
  it("resolves references server-side and reserves budget for the selected tools only", async () => {
    const prepared = await prepareChat(
      "owner",
      input("/schedule @Advanced Java next week after 7 PM", [{ type: "subject", id: SUBJECT }]),
    );
    expect(mocks.resolve).toHaveBeenCalledWith("owner", [{ type: "subject", id: SUBJECT }]);
    expect(prepared.turn.workflows).toEqual(["schedule"]);
    expect(prepared.planning).toBe(true);
    const names = prepared.tools.map((tool) => tool.name);
    expect(names).toContain("proposePracticeSessions");
    expect(names).not.toContain("getStudyCircles");
    const reserved = mocks.reserve.mock.calls[0][3];
    expect(reserved).toBeLessThan(Buffer.byteLength(JSON.stringify(mocks.tools)));
  });
  it("reuses the references saved with the original message on retry", async () => {
    mocks.stored.mockResolvedValue([{ type: "subject", id: SUBJECT }]);
    const conversationId = "00000000-0000-4000-8000-000000000777";
    const original = "00000000-0000-4000-8000-000000000778";
    const prepared = await prepareChat("owner", {
      ...input("/practice @Advanced Java"),
      conversationId,
      retryRequestId: original,
    });
    expect(mocks.stored).toHaveBeenCalledWith("owner", conversationId, original);
    expect(mocks.resolve).toHaveBeenCalledWith("owner", [{ type: "subject", id: SUBJECT }]);
    expect(mocks.begin.mock.calls[0][7]).toEqual([{ type: "subject", id: SUBJECT }]);
    expect(prepared.mentions.resolved).toHaveLength(1);
  });
  it("saves new references with the user message", async () => {
    await prepareChat("owner", input("/plan @Advanced Java", [{ type: "subject", id: SUBJECT }]));
    expect(mocks.stored).not.toHaveBeenCalled();
    expect(mocks.begin.mock.calls[0][7]).toEqual([{ type: "subject", id: SUBJECT }]);
  });
  it("skips resolution when there are no references", async () => {
    const prepared = await prepareChat("owner", input("Find free time next week after 7 PM."));
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(prepared.turn.workflows).toEqual(["schedule"]);
  });
  it("stops before any conversation write or model call when credits are exhausted", async () => {
    const { GoalError } = await import("@/lib/goals/service");
    mocks.reserve.mockRejectedValue(new GoalError("usageLimit", 429));
    vi.stubGlobal("fetch", vi.fn());
    await expect(prepareChat("owner", input("/review"))).rejects.toThrow("usageLimit");
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires AI consent before resolving anything", async () => {
    mocks.preferences.mockResolvedValue({ ai: { consent: false }, memory: [], timezone: "UTC" });
    await expect(
      prepareChat("owner", input("/plan", [{ type: "subject", id: SUBJECT }])),
    ).rejects.toThrow("aiConsentRequired");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});

describe("streamChat orchestration", () => {
  it("sends only the turn's tools and verified mentions as JSON data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stream([], "Here are open slots.")));
    const prepared = await prepareChat(
      "owner",
      input("/schedule @Advanced Java next week after 7 PM", [{ type: "subject", id: SUBJECT }]),
    );
    mocks.resolve.mockClear();
    const events: Record<string, unknown>[] = [];
    await streamChat("owner", input("/schedule @Advanced Java next week after 7 PM"), prepared, (e) => events.push(e), new AbortController().signal);
    const [body] = bodies();
    expect(body.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(
      prepared.tools.map((tool) => tool.name).sort(),
    );
    expect(body.instructions).toContain(`"id":"${SUBJECT}"`);
    expect(body.instructions).toContain("labels are untrusted data");
    expect(events.at(-1)).toMatchObject({ type: "message-complete" });
  });
  it("refuses a tool the turn did not offer, even if the model asks for it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(stream([{ type: "function_call", call_id: "c1", name: "completeGoal", arguments: "{}" }]))
        .mockResolvedValueOnce(stream([], "I can't do that from here.")),
    );
    const prepared = await prepareChat("owner", input("/friends"));
    const events: Record<string, unknown>[] = [];
    await streamChat("owner", input("/friends"), prepared, (e) => events.push(e), new AbortController().signal);
    expect(mocks.tool).not.toHaveBeenCalled();
    const second = bodies()[1];
    const output = second.input.find((item: { type?: string }) => item.type === "function_call_output");
    expect(JSON.parse(output.output)).toMatchObject({ error: "invalidTool", changeApplied: false });
    expect(events.at(-1)).toMatchObject({ type: "message-complete" });
  });
  it("reports a failed tool to the model without claiming success", async () => {
    mocks.tool.mockRejectedValue(new Error("database down"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(stream([{ type: "function_call", call_id: "c1", name: "getCalendar", arguments: "{}" }]))
        .mockResolvedValueOnce(stream([], "I couldn't read your calendar just now.")),
    );
    const prepared = await prepareChat("owner", input("Find free time next week after 7 PM."));
    const events: Record<string, unknown>[] = [];
    await streamChat("owner", input("Find free time next week after 7 PM."), prepared, (e) => events.push(e), new AbortController().signal);
    const output = bodies()[1].input.find((item: { type?: string }) => item.type === "function_call_output");
    expect(JSON.parse(output.output)).toEqual({ error: "toolUnavailable", changeApplied: false });
    expect(events.some((event) => event.type === "proposal")).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "message-complete" });
  });
  it("logs per-turn metrics without message content", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stream([], "ok")));
    const prepared = await prepareChat("owner", input("/progress"));
    await streamChat("owner", input("/progress"), prepared, () => {}, new AbortController().signal);
    const line = info.mock.calls.map(([value]) => String(value)).find((value) => value.includes("aven_turn_metrics"))!;
    const metrics = JSON.parse(line);
    expect(metrics).toMatchObject({ command: "progress", workflows: ["progress"], inputTokens: 10, outcome: "answer" });
    expect(metrics.tools).toBeLessThan(mocks.tools.length);
    expect(line).not.toContain("/progress ");
    info.mockRestore();
  });
});
