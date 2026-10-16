import { describe, expect, it } from "vitest";
import {
  avenCommands,
  matchCommands,
  parseCommand,
  mentionReferenceSchema,
} from "@/lib/aven/commands";
import { planTurn, workflowTools } from "@/lib/aven/orchestration";
import {
  activeMentions,
  applySelection,
  findTrigger,
  highlightSegments,
  isBareHelp,
  moveActive,
  type ComposerMention,
} from "@/components/aven/composer-model";
import en from "@/messages/en.json";

const java: ComposerMention = { type: "subject", id: "00000000-0000-4000-8000-000000000001", label: "Advanced Java" };
const javaGoal: ComposerMention = { type: "goal", id: "00000000-0000-4000-8000-000000000002", label: "Advanced Java" };
const sql: ComposerMention = { type: "subject", id: "00000000-0000-4000-8000-000000000003", label: "SQL" };

describe("command registry and discovery", () => {
  it("registers every command with copy", () => {
    expect(avenCommands.map((c) => c.name)).toEqual([
      "study", "search", "plan", "schedule", "catchup", "review", "analyze", "summarize", "practice",
      "goals", "subjects", "progress", "friends", "help",
    ]);
    for (const command of avenCommands)
      expect(en.aven.commands[command.name].description).toBeTruthy();
  });
  it("discovers commands by prefix", () => {
    expect(matchCommands("").length).toBe(avenCommands.length);
    expect(matchCommands("p").map((c) => c.name)).toEqual(["plan", "practice", "progress"]);
    expect(matchCommands("stu").map((c) => c.name)).toEqual(["study"]);
    expect(matchCommands("sch").map((c) => c.name)).toEqual(["schedule"]);
    expect(matchCommands("zzz")).toEqual([]);
  });
  it("parses the first registered command token, at the start or mid-text", () => {
    expect(parseCommand("/schedule @Advanced Java next week")).toMatchObject({
      command: { name: "schedule" },
      rest: "@Advanced Java next week",
    });
    expect(parseCommand("/SCHEDULE")).toMatchObject({ command: { name: "schedule" }, rest: "" });
    expect(parseCommand("please /schedule this")).toMatchObject({ command: { name: "schedule" }, rest: "please this" });
    expect(parseCommand("a/schedule b").command).toBeNull();
    expect(parseCommand("/scheduled things").command).toBeNull();
    expect(parseCommand("/unknown thing").command).toBeNull();
  });
  it("accepts only typed references, never labels or user IDs", () => {
    expect(mentionReferenceSchema.safeParse({ type: "subject", id: java.id }).success).toBe(true);
    expect(mentionReferenceSchema.safeParse({ type: "user", id: java.id }).success).toBe(false);
    expect(mentionReferenceSchema.safeParse({ type: "subject", id: "1; drop table" }).success).toBe(false);
    expect(mentionReferenceSchema.parse({ type: "subject", id: java.id, label: "ignored" })).toEqual({ type: "subject", id: java.id });
  });
});

describe("turn planning", () => {
  it("routes a command with a mention and free text to one workflow and a small toolset", () => {
    const plan = planTurn("/schedule @Advanced Java next week after 7 PM", ["subject"]);
    expect(plan.command).toBe("schedule");
    expect(plan.workflows).toEqual(["schedule"]);
    expect(plan.planning).toBe(true);
    expect(plan.tools).toEqual(expect.arrayContaining(["createStudySchedule", "proposePracticeSessions", "getCalendar", "auditTopicCoverage"]));
    expect(plan.tools).not.toContain("getStudyCircles");
    expect(plan.tools).not.toContain("organizeLearningResource");
    expect(plan.guidance).toContain("/schedule");
  });
  it("gives the same scheduling request the same workflow and tools with or without shortcuts", () => {
    const shortcut = planTurn("/schedule @Advanced Java next week after 7 PM", ["subject"]);
    const natural = planTurn("Schedule Advanced Java study sessions next week after 7 PM");
    expect(natural.workflows).toEqual(shortcut.workflows);
    expect(new Set(natural.tools)).toEqual(new Set(shortcut.tools));
    expect(natural.planning).toBe(shortcut.planning);
  });
  it.each([
    ["I'm struggling with Advanced Java. Add more sessions.", ["practice", "schedule"]],
    ["I've missed several SQL topics.", ["catchup"]],
    ["Help me finish my backend developer goal.", ["plan"]],
    ["Find free time next week after 7 PM.", ["schedule"]],
    ["I want to study more consistently than last week.", ["progress"]],
    ["How am I doing compared to my friends?", ["progress", "friends"]],
  ])("understands natural language: %s", (message, workflows) => {
    const plan = planTurn(message);
    expect(plan.workflows.sort()).toEqual([...workflows].sort());
    expect(plan.tools).not.toBeNull();
  });
  it("maps every command to the workflow its natural-language twin reaches", () => {
    const pairs: [string, string][] = [
      ["/plan become a backend developer", "I want to become a backend developer"],
      ["/catchup", "Help me catch up, I'm falling behind"],
      ["/practice @SQL", "I'm struggling with SQL"],
      ["/progress", "How is my progress?"],
      ["/friends", "Show my study circles leaderboard"],
    ];
    for (const [shortcut, natural] of pairs)
      expect(planTurn(shortcut).workflows[0]).toBe(planTurn(natural).workflows[0]);
  });
  it("keeps every tool for unrecognized, learning and multi-part requests", () => {
    expect(planTurn("hello there").tools).toBeNull();
    expect(planTurn("Explain Java streams").tools).toBeNull();
    expect(planTurn("hello").workflows).toEqual(["general"]);
  });
  it("adds only the read tools a mention needs", () => {
    expect(planTurn("/friends @Maya", ["friend"]).tools).toEqual(
      expect.arrayContaining(["getStudyCircles"]),
    );
    const plan = planTurn("/friends", ["friend"]);
    expect(plan.tools?.filter((name) => !["getUserProfile", "getSubjects", "getUserGoals", "getCalendar"].includes(name))).toEqual(["getStudyCircles"]);
  });
  it("answers a bare /help without workspace tools", () => {
    const plan = planTurn("/help");
    expect(plan.tools).toEqual(["getUserProfile"]);
    expect(plan.guidance).toContain("/schedule");
  });
  it("never lets a command unlock a tool outside its workflow", () => {
    const plan = planTurn("/friends what about this week");
    expect(plan.tools).not.toContain("completeGoal");
    expect(plan.tools).not.toContain("cancelStudySessions");
    expect(plan.tools).not.toContain("manageGoal");
    // Words that ask for a change route by meaning; the change is still an approval card.
    expect(planTurn("/friends delete my SQL topic").workflows).toEqual(["friends", "goals", "subjects"]);
  });
  it("cuts the tool count for routed turns", () => {
    const sizes = Object.values(workflowTools).map((tools) => tools.length + 4);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
  });
});

describe("composer: autocomplete triggers and keyboard", () => {
  it("opens commands at the start or after whitespace", () => {
    expect(findTrigger("/sch", 4)).toEqual({ kind: "command", start: 0, query: "sch" });
    expect(findTrigger("hi /sch", 7)).toEqual({ kind: "command", start: 3, query: "sch" });
    expect(findTrigger("hi/sch", 6)).toBeNull();
    expect(findTrigger("/schedule ", 10)).toBeNull();
  });
  it("opens mentions after whitespace, allowing names with spaces", () => {
    expect(findTrigger("study @adv", 10)).toEqual({ kind: "mention", start: 6, query: "adv" });
    expect(findTrigger("@Advanced Ja", 12)).toEqual({ kind: "mention", start: 0, query: "Advanced Ja" });
    expect(findTrigger("mail me@example.com", 19)).toBeNull();
    expect(findTrigger("@a b c d e f", 12)).toBeNull();
    expect(findTrigger("@line\nnext", 10)).toBeNull();
  });
  it("wraps arrow-key navigation and handles an empty list", () => {
    expect(moveActive(0, 1, 3)).toBe(1);
    expect(moveActive(2, 1, 3)).toBe(0);
    expect(moveActive(0, -1, 3)).toBe(2);
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
  it("replaces the typed query with the chosen token and moves the caret after it", () => {
    const value = "/schedule @adv next week";
    const trigger = findTrigger(value, 14)!;
    expect(applySelection(value, trigger, 14, "@Advanced Java")).toEqual({
      value: "/schedule @Advanced Java next week",
      caret: 25,
    });
    expect(applySelection("/sch", findTrigger("/sch", 4)!, 4, "/schedule")).toEqual({ value: "/schedule ", caret: 10 });
  });
  it("recognizes a bare /help for the local help panel", () => {
    expect(isBareHelp(" /help ")).toBe(true);
    expect(isBareHelp("/help me plan")).toBe(false);
  });
});

describe("composer: mentions", () => {
  it("keeps multiple mentions in the order chosen", () => {
    const value = "/plan @Advanced Java and @SQL before exams";
    expect(activeMentions(value, [java, sql]).map((m) => m.id)).toEqual([java.id, sql.id]);
  });
  it("keeps two records with the same name as separate references", () => {
    const value = "compare @Advanced Java with @Advanced Java";
    expect(activeMentions(value, [java, javaGoal]).map((m) => m.type)).toEqual(["subject", "goal"]);
    // Deleting one token drops the later reference only.
    expect(activeMentions("compare @Advanced Java with", [java, javaGoal]).map((m) => m.type)).toEqual(["subject"]);
  });
  it("drops a mention when its token is edited or deleted", () => {
    expect(activeMentions("study @Advanced Jav", [java])).toEqual([]);
    expect(activeMentions("study @Advanced JavaScript", [java])).toEqual([]);
    expect(activeMentions("study @Advanced Java.", [java])).toEqual([java]);
  });
  it("splits text into highlighted command and mention tokens", () => {
    expect(highlightSegments("/schedule @Advanced Java tonight", [java])).toEqual([
      { text: "/schedule", kind: "command" },
      { text: " ", kind: "text" },
      { text: "@Advanced Java", kind: "mention", type: "subject" },
      { text: " tonight", kind: "text" },
    ]);
    expect(highlightSegments("/nope @x", [])).toEqual([{ text: "/nope @x", kind: "text" }]);
  });
});
