vi.mock("@/lib/aven/access", () => ({
  assertAvenAccess: vi.fn().mockResolvedValue(undefined),
  assertConversationActive: vi.fn().mockResolvedValue(undefined),
  assertTurnActive: vi.fn().mockResolvedValue(undefined),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
const mocks = vi.hoisted(() => ({ finish: vi.fn(), usage: vi.fn(), tool: vi.fn(), snapshot: vi.fn() }));
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
vi.mock("@/lib/goals/service", () => ({
  GoalError: class GoalError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
}));
vi.mock("@/lib/aven/preferences", () => ({ getAvenPreferences: vi.fn() }));
vi.mock("@/lib/aven/conversations", () => ({
  beginConversationTurn: vi.fn(),
  finishConversationTurn: mocks.finish,
  keepStoppedAnswer: vi.fn(),
  saveStreamingSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/aven/usage", () => ({ reserveUsage: vi.fn(), finishUsage: mocks.usage }));
vi.mock("@/lib/aven/tools", () => ({
  avenTools: [],
  executeAvenTool: mocks.tool,
  isAvenWriteTool: () => false,
}));
import { streamChat } from "@/lib/aven/chat";
import { buildPresentation, presentationComponentId, presentationToolDefinitions } from "@/lib/aven/presentation-tools";
import { strictSchema } from "@/lib/aven/tool-schema";
import { parseUiComponent, readyComponent, savedState, withoutSecrets } from "@/lib/aven/ui-components";
import {
  checklistProgress,
  plannerTotals,
  plannerWindow,
  targetSummary,
  validChecklistState,
  type ChecklistData,
} from "@/lib/aven/ui-blocks";
import { dailySeries } from "@/lib/aven/ui-builders";
import { planTurn, wantsPresentation } from "@/lib/aven/orchestration";
import { diagramLayers } from "@/components/aven/generative-ui/diagram-layout";
import AvenGenerativeUI from "@/components/aven/AvenGenerativeUI";

const html = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {node}
    </NextIntlClientProvider>,
  );
const checklist: ChecklistData = {
  title: "Prepare for Java",
  sections: [
    { id: "setup", title: "Set up", items: [{ id: "jdk", label: "Install the JDK", hint: null }, { id: "ide", label: "Open your IDE", hint: "IntelliJ or VS Code" }] },
    { id: "review", title: "Review", items: [{ id: "oop", label: "Revise OOP basics", hint: null }] },
  ],
};
const quizArgs = {
  title: "Java basics",
  questions: [
    { id: "q1", prompt: "Which keyword creates an object?", options: ["new", "make", "create"], correctIndex: 0, explanation: "`new` allocates and constructs." },
    { id: "q2", prompt: "Is Java statically typed?", options: ["Yes", "No"], correctIndex: 0, explanation: "Types are checked at compile time." },
  ],
};

describe("presentation tools", () => {
  it("builds a validated checklist block with a stable id per call", () => {
    const { component } = buildPresentation("showChecklist", checklist, "call_ABC123");
    expect(component).toMatchObject({ id: presentationComponentId("showChecklist", "call_ABC123"), type: "checklist", status: "ready" });
    expect(component.id).toBe("checklist-callABC123");
  });
  it("rejects duplicate ids, dangling diagram edges and out-of-range answers", () => {
    const duplicate = { ...checklist, sections: [checklist.sections[0], { ...checklist.sections[1], items: [{ id: "jdk", label: "Again", hint: null }] }] };
    expect(() => buildPresentation("showChecklist", duplicate, "c1")).toThrow("invalidToolInput");
    expect(() =>
      buildPresentation("showDiagram", { title: "x", kind: "flow", nodes: [{ id: "a", label: "A", detail: null, group: null }, { id: "b", label: "B", detail: null, group: null }], edges: [{ from: "a", to: "zz", label: null }] }, "c2"),
    ).toThrow("invalidToolInput");
    expect(() => buildPresentation("showQuiz", { ...quizArgs, questions: [{ ...quizArgs.questions[1], correctIndex: 3 }] }, "c3")).toThrow("invalidToolInput");
  });
  it("keeps quiz answers out of the public block", () => {
    const { component, secret } = buildPresentation("showQuiz", quizArgs, "call_q");
    expect(JSON.stringify(component)).not.toContain("correctIndex");
    expect(JSON.stringify(component)).not.toContain("allocates");
    expect(secret).toEqual({ answers: { q1: 0, q2: 0 }, explanations: { q1: "`new` allocates and constructs.", q2: "Types are checked at compile time." } });
  });
  it("normalises slider values onto their step", () => {
    const { component } = buildPresentation("showStudyTargets", { title: "Targets", weeklyHours: 10, sessionMinutes: 47, breakMinutes: 10, technique: "pomodoro", timeOfDay: "evening" }, "c4");
    expect(component.data).toMatchObject({ sessionMinutes: 45 });
  });
  it("publishes strict function schemas", () => {
    const tools = presentationToolDefinitions(strictSchema);
    expect(tools.map((tool) => tool.name)).toEqual(["showChecklist", "showQuiz", "showFlashcards", "showDiagram", "showStudyTargets"]);
    expect(tools.every((tool) => tool.strict && JSON.stringify(tool.parameters).includes('"additionalProperties":false'))).toBe(true);
  });
  it("drops oversized or unknown blocks and strips secrets on read", () => {
    const huge = { ...checklist, sections: [{ id: "s", title: "S", items: Array.from({ length: 15 }, (_, index) => ({ id: `i${index}`, label: "x".repeat(200), hint: "y".repeat(200) })) }] };
    expect(parseUiComponent({ id: "c", type: "checklist", version: 1, status: "ready", data: { ...huge, sections: Array(8).fill(huge.sections[0]).map((section, index) => ({ ...section, id: `s${index}`, items: section.items.map((item: { id: string }) => ({ ...item, id: `${item.id}-${index}` })) })) } })).toBeNull();
    expect(parseUiComponent({ id: "c", type: "html", version: 1, status: "ready", data: "<b>" })).toBeNull();
    expect(withoutSecrets({ components: "[]", "secret:quiz-1": "{}", "ui:quiz-1": "{}" })).toEqual({ components: "[]", "ui:quiz-1": "{}" });
    expect(savedState({ "ui:c": JSON.stringify({ v: 2, data: { checked: [] } }) }, "c")).toEqual({ v: 2, data: { checked: [] } });
    expect(savedState({ "ui:c": "{bad" }, "c")).toBeNull();
  });
});

describe("intent routing", () => {
  it.each([
    ["Create a checklist to prepare for studying Java", true],
    ["Quiz me on Java collections", true],
    ["Make flashcards for Spanish verbs", true],
    ["Explain the architecture of AI agents", true],
    ["Help me set study targets", true],
    ["What is polymorphism?", false],
    ["Show my goals", false],
  ])("%s → presentation %s", (message, expected) => {
    expect(wantsPresentation(message)).toBe(expected);
    expect(planTurn(message).presentation).toBe(expected);
  });
});

describe("streamChat with presentation tools", () => {
  const prepared = {
    preferences: { ai: { consent: true, locale: "en" }, memory: [], timezone: "UTC" },
    reservation: { id: "reservation", config: { key: "test-key", model: "test-model" } },
    conversation: { id: "conversation", goalId: null, summary: "", summaryMessageCount: 0, messageCount: 1, history: [{ role: "user", content: "Quiz me" }] },
    tools: presentationToolDefinitions(strictSchema),
  } as unknown as Parameters<typeof streamChat>[2];
  const input = { requestId: "request", conversationId: null, goalId: null, message: "Quiz me on Java", planning: false };
  const sse = (events: unknown[]) =>
    new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.finish.mockResolvedValue(undefined);
    mocks.usage.mockResolvedValue(undefined);
    mocks.snapshot.mockResolvedValue(true);
  });
  it("streams a placeholder then the block, never the answers, and makes no follow-up model request", async () => {
    const call = { type: "function_call", name: "showQuiz", call_id: "call_quiz1", arguments: JSON.stringify(quizArgs) };
    const fetch = vi.fn().mockResolvedValue(
      sse([
        { type: "response.output_text.delta", delta: "Here is a short quiz." },
        { type: "response.output_item.added", item: { type: "function_call", name: "showQuiz", call_id: "call_quiz1" } },
        { type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Here is a short quiz." }] }, call], usage: { input_tokens: 10, output_tokens: 20 } } },
      ]),
    );
    vi.stubGlobal("fetch", fetch);
    const events: Record<string, unknown>[] = [];
    await streamChat("owner", input, prepared, (event) => events.push(event), new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    const blocks = events.filter((event) => event.type === "ui-component").map((event) => event.component as { id: string; status: string });
    expect(blocks.map((block) => block.status)).toEqual(["loading", "ready"]);
    expect(new Set(blocks.map((block) => block.id)).size).toBe(1);
    expect(JSON.stringify(events)).not.toContain("correctIndex");
    expect(JSON.stringify(events)).not.toContain("allocates");
    expect(events.at(-1)).toMatchObject({ type: "message-complete" });
    // The answer key is saved with the reply (server-only) for grading.
    const context = mocks.finish.mock.calls.at(-1)?.[7] as Record<string, string>;
    expect(JSON.parse(context["secret:quiz-callquiz1"])).toMatchObject({ answers: { q1: 0 } });
    expect(JSON.parse(context.components)[0]).toMatchObject({ type: "quiz", id: "quiz-callquiz1" });
    expect(mocks.tool).not.toHaveBeenCalled();
  });
  it("withdraws the placeholder and tells the model when block content is invalid", async () => {
    const bad = { type: "function_call", name: "showChecklist", call_id: "call_bad", arguments: JSON.stringify({ title: "x", sections: [] }) };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        sse([
          { type: "response.output_item.added", item: { type: "function_call", name: "showChecklist", call_id: "call_bad" } },
          { type: "response.completed", response: { status: "completed", output: [bad], usage: { input_tokens: 1, output_tokens: 1 } } },
        ]),
      )
      .mockResolvedValueOnce(sse([{ type: "response.output_text.delta", delta: "Sorry, here it is as text." }, { type: "response.completed", response: { status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1 } } }]));
    vi.stubGlobal("fetch", fetch);
    const events: Record<string, unknown>[] = [];
    await streamChat("owner", input, prepared, (event) => events.push(event), new AbortController().signal);
    expect(events.filter((event) => event.type === "ui-component").map((event) => (event.component as { status: string }).status)).toEqual(["loading", "removed"]);
    const followUp = JSON.parse(fetch.mock.calls[1][1].body);
    expect(JSON.stringify(followUp.input)).toContain("invalidToolInput");
  });
});

describe("local calculations", () => {
  it("counts checklist progress per section and overall", () => {
    expect(checklistProgress(checklist, ["jdk", "oop"])).toMatchObject({ complete: 2, total: 3, percent: 67, sections: [{ done: 1, total: 2 }, { done: 1, total: 1 }] });
    expect(validChecklistState(checklist, { checked: ["jdk"], collapsed: ["review"] })).toBe(true);
    expect(validChecklistState(checklist, { checked: ["not-an-item"], collapsed: [] })).toBe(false);
  });
  it("derives study-target and planner totals without the model", () => {
    expect(targetSummary({ weeklyHours: 10, sessionMinutes: 50, breakMinutes: 10 })).toEqual({ sessionsPerWeek: 12, perDayMinutes: 86, breakMinutesPerWeek: 110 });
    expect(plannerTotals([{ sessions: 3 }, { sessions: 2 }], 60)).toEqual({ sessions: 5, minutes: 300 });
    expect(plannerWindow("evening", { earliest: "19:00", latest: "22:00" })).toEqual({ earliest: "17:00", latest: "22:00" });
    expect(plannerWindow("requested", { earliest: "19:00", latest: "22:00" })).toEqual({ earliest: "19:00", latest: "22:00" });
  });
  it("lays diagrams out in layers and tolerates cycles", () => {
    const nodes = ["user", "planner", "tools", "memory", "answer"].map((id) => ({ id }));
    expect(diagramLayers(nodes, [
      { from: "user", to: "planner" },
      { from: "planner", to: "tools" },
      { from: "planner", to: "memory" },
      { from: "tools", to: "answer" },
      { from: "memory", to: "planner" },
    ])).toEqual([["user"], ["planner"], ["tools", "memory"], ["answer"]]);
  });
  it("fills every day of a grounded daily series with zeros where nothing was studied", () => {
    expect(dailySeries([{ date: "2026-10-02", minutes: 45 }], { from: "2026-10-01", to: "2026-10-03" })).toEqual([
      { date: "2026-10-01", minutes: 0 },
      { date: "2026-10-02", minutes: 45 },
      { date: "2026-10-03", minutes: 0 },
    ]);
  });
});

describe("rendering", () => {
  it("renders a checklist with real checkboxes, counts and saved progress", () => {
    const block = readyComponent("checklist", checklist, "checklist-1")!;
    const markup = html(
      <AvenGenerativeUI components={[block]} requestId="r" persist context={{ "ui:checklist-1": JSON.stringify({ v: 1, data: { checked: ["jdk"], collapsed: [] } }) }} />,
    );
    expect(markup.match(/type="checkbox"/g)).toHaveLength(3);
    expect(markup).toContain("1 of 3 done");
    expect(markup).toContain('aria-valuenow="33"');
    expect(markup).not.toMatch(/☐|☑|\[ \]/);
  });
  it("renders quiz options as radios without any answer key", () => {
    const { component } = buildPresentation("showQuiz", quizArgs, "call_q");
    const markup = html(<AvenGenerativeUI components={[component]} requestId="r" persist />);
    expect(markup.match(/type="radio"/g)).toHaveLength(5);
    expect(markup).not.toContain("allocates");
  });
  it("renders diagram labels as inert text", () => {
    const block = readyComponent("diagram", {
      title: "Agents",
      kind: "architecture",
      nodes: [
        { id: "a", label: "<script>alert(1)</script>", detail: null, group: "core" },
        { id: "b", label: "Tools", detail: "Calls APIs", group: null },
      ],
      edges: [{ from: "a", to: "b", label: "uses" }],
    }, "diagram-1")!;
    const markup = html(<AvenGenerativeUI components={[block]} />);
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup.match(/data-node=/g)).toHaveLength(2);
    expect(markup).toContain("1 connection");
  });
  it("renders sliders, radios and a select for study targets", () => {
    const block = readyComponent("study_targets", { title: "Targets", weeklyHours: 10, sessionMinutes: 45, breakMinutes: 10, technique: "pomodoro", timeOfDay: "evening" }, "t")!;
    const markup = html(<AvenGenerativeUI components={[block]} />);
    expect(markup.match(/type="range"/g)).toHaveLength(3);
    expect(markup.match(/type="radio"/g)).toHaveLength(5);
    expect(markup).toContain("<select");
    expect(markup).toContain("14");
  });
});
