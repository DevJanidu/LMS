import { describe, expect, it } from "vitest";
import { parseMarkdown } from "@/components/aven/markdown";
import { reconcile } from "@/components/aven/useAvenConversation";
import { messageKey } from "@/components/aven/types";
import { activityCategory } from "@/components/aven/AvenActivity";
import { goalCardsFromTool } from "@/lib/aven/goal-cards";
import { boundedHistory } from "@/lib/aven/context";
const goalId = "8d0f7c56-8a51-4a9e-9a6f-2a1f5d1a7c11";
const progress = {
  percent: 42.4,
  preparation: 40,
  hours: 3,
  quantity: 0,
  outcomeConfirmed: false,
  health: "onTrack",
  daysRemaining: 12,
  nextTaskId: "task-2",
  milestoneProgress: { m1: 100, m2: 20 },
  taskProgress: {},
  blockedIds: [],
};
describe("Aven Markdown parser", () => {
  it("parses lists, ordered lists, tables, quotes and code", () => {
    const blocks = parseMarkdown(
      [
        "## Plan",
        "- one",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "| Day | Task |",
        "| --- | --- |",
        "| Mon | Read |",
        "",
        "> Note",
        "```ts",
        "const a = 1;",
        "```",
        "Closing text",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "list",
      "list",
      "table",
      "quote",
      "code",
      "paragraph",
    ]);
    expect(blocks[1]).toMatchObject({ ordered: false, items: ["one", "two"] });
    expect(blocks[2]).toMatchObject({
      ordered: true,
      items: ["first", "second"],
    });
    expect(blocks[3]).toMatchObject({
      header: ["Day", "Task"],
      rows: [["Mon", "Read"]],
    });
    expect(blocks[5]).toMatchObject({ language: "ts", text: "const a = 1;" });
  });
  it("renders an unclosed fence as code while streaming", () => {
    const blocks = parseMarkdown("Intro\n```js\nlet x");
    expect(blocks.at(-1)).toMatchObject({ kind: "code", text: "let x" });
  });
  it("keeps completed blocks byte-identical as text streams in", () => {
    const before = parseMarkdown("First paragraph.\n\nSecond par");
    const after = parseMarkdown("First paragraph.\n\nSecond paragraph grows");
    expect(after[0].raw).toBe(before[0].raw);
    expect(after[1].raw).not.toBe(before[1].raw);
  });
});
describe("Aven message reconciliation", () => {
  it("keys messages by role and request so saved rows replace optimistic ones without remounting", () => {
    const optimistic = {
      id: "req-assistant",
      requestId: "req",
      role: "assistant",
      content: "Hello",
      status: "streaming",
    };
    const saved = { ...optimistic, id: "db-row", status: "complete" };
    expect(messageKey(optimistic)).toBe(messageKey(saved));
  });
  it("reuses unchanged message objects", () => {
    const user = {
      id: "u",
      requestId: "r1",
      role: "user",
      content: "Hi",
      status: "complete",
      createdAt: "2026-10-12T10:00:00.000Z",
    };
    const reply = {
      id: "a",
      requestId: "r1",
      role: "assistant",
      content: "Draft",
      status: "streaming",
    };
    const next = reconcile(
      [user, reply],
      [{ ...user }, { ...reply, content: "Final", status: "complete" }],
    );
    expect(next[0]).toBe(user);
    expect(next[1]).not.toBe(reply);
    expect(next[1].content).toBe("Final");
  });
});
describe("Aven activity labels", () => {
  it("maps real tool names to user-facing categories", () => {
    expect(activityCategory("getUserGoals")).toBe("goals");
    expect(activityCategory("getCalendar")).toBe("calendar");
    expect(activityCategory("moveStudySessions")).toBe("conflicts");
    expect(activityCategory("proposeStudySchedule")).toBe("studyPlan");
    expect(activityCategory("createGoalTask")).toBe("changes");
  });
});
describe("Goal progress cards", () => {
  it("builds a validated card from verified goal details", () => {
    const [card] = goalCardsFromTool("getGoalDetails", {
      goal: {
        id: goalId,
        title: "Pass Java exam",
        status: "active",
        targetDate: "2026-11-30",
      },
      progress,
      milestones: [
        { id: "m1", title: "Basics" },
        { id: "m2", title: "Collections" },
      ],
      tasks: [
        { id: "task-1", title: "Read chapter 1" },
        { id: "task-2", title: "Practice maps" },
      ],
    });
    expect(card).toEqual({
      id: goalId,
      title: "Pass Java exam",
      status: "active",
      targetDate: "2026-11-30",
      percent: 42,
      health: "onTrack",
      daysRemaining: 12,
      remainingMilestones: ["Collections"],
      nextTask: "Practice maps",
    });
  });
  it("summarizes only active goals from the goal list and ignores invalid shapes", () => {
    const cards = goalCardsFromTool("getUserGoals", {
      goals: [
        {
          id: goalId,
          title: "Active",
          status: "active",
          targetDate: null,
          progress,
        },
        {
          id: "0c6c1b9e-6a8d-4a8f-9a5c-0d3f1e2b4c5d",
          title: "Done",
          status: "completed",
          targetDate: null,
          progress,
        },
        { id: "not-a-uuid", title: "Bad", status: "active", progress },
      ],
    });
    expect(cards.map((card) => card.title)).toEqual(["Active"]);
    expect(goalCardsFromTool("getCalendar", { goals: [] })).toEqual([]);
    expect(goalCardsFromTool("getGoalDetails", "text")).toEqual([]);
  });
});
describe("Regenerated history", () => {
  it("excludes superseded replies from model context", () => {
    const history = boundedHistory(
      [
        { role: "user", content: "Plan my day", status: "complete" },
        { role: "assistant", content: "Old answer", status: "superseded" },
        { role: "assistant", content: "New answer", status: "complete" },
      ],
      10000,
    );
    expect(history.map((item) => item.content)).toEqual([
      "Plan my day",
      "New answer",
    ]);
  });
});
