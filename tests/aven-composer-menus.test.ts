import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import {
  availabilityOf,
  filterItems,
  plusItems,
  slashItems,
  type ComposerItem,
} from "@/lib/aven/composer-registry";
import { avenCommands, parseCommand } from "@/lib/aven/commands";
import { planTurn } from "@/lib/aven/orchestration";
import { applySelection, findTrigger, highlightSegments } from "@/components/aven/composer-model";
import { placeMenu } from "@/components/aven/composer/useMenuPlacement";
const copy = en.aven.composerItems as unknown as Record<string, { label: string; description: string }>;
const label = (id: string) => copy[id].label;
const env = { speech: true, uploads: true };
const all = (items: ComposerItem[]): ComposerItem[] => items.flatMap((item) => [item, ...all(item.children ?? [])]);
describe("composer registry", () => {
  it("has copy, an icon and either an action, a submenu or an unavailable reason for every item", () => {
    for (const item of [...all(slashItems), ...all(plusItems)]) {
      expect(copy[item.id]?.label, item.id).toBeTruthy();
      expect(copy[item.id]?.description, item.id).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(Boolean(item.action || item.children || !availabilityOf(item, env).available), item.id).toBe(true);
    }
  });
  it("only inserts commands the server actually routes", () => {
    const names = new Set<string>(avenCommands.map((command) => command.name));
    for (const item of [...all(slashItems), ...all(plusItems)])
      if (item.action?.type === "command") expect(names.has(item.action.command), item.id).toBe(true);
  });
  it("includes the requested slash commands", () => {
    expect(slashItems.map((item) => item.id)).toEqual(
      expect.arrayContaining(["study", "search", "plan", "goals", "analyze", "summarize", "model", "dictate", "feedback"]),
    );
  });
  it("never offers fake features: no-integration items are unavailable with a reason, deep research is absent", () => {
    for (const id of ["model", "feedback"]) {
      const result = availabilityOf(slashItems.find((item) => item.id === id)!, env);
      expect(result).toMatchObject({ available: false });
      if (!result.available) expect(copy.reasons as unknown as Record<string, string>).toHaveProperty(result.reason);
    }
    expect(availabilityOf(plusItems.find((item) => item.id === "webSearch")!, env).available).toBe(false);
    expect(plusItems.some((item) => /research/i.test(item.id))).toBe(false);
  });
  it("disables dictation when the browser has no speech recognition, and uploads when unavailable", () => {
    const dictate = slashItems.find((item) => item.id === "dictate")!;
    expect(availabilityOf(dictate, { ...env, speech: false })).toEqual({ available: false, reason: "speechUnsupported" });
    expect(availabilityOf(plusItems[0], { ...env, uploads: false }).available).toBe(false);
  });
  it("has a nested Study submenu with working actions", () => {
    const study = slashItems.find((item) => item.id === "study")!;
    expect(study.children?.map((item) => item.action?.type)).toEqual(["command", "command", "navigate"]);
  });
});
describe("command filtering", () => {
  it("/stu filters to Study first", () => {
    expect(filterItems(slashItems, "stu", label)[0].id).toBe("study");
  });
  it("matches by prefix, keyword and fuzzy subsequence, in that order", () => {
    expect(filterItems(slashItems, "sum", label)[0].id).toBe("summarize");
    expect(filterItems(slashItems, "voice", label).map((item) => item.id)).toEqual(["dictate"]);
    expect(filterItems(slashItems, "smz", label).map((item) => item.id)).toContain("summarize");
    expect(filterItems(slashItems, "", label)).toEqual(slashItems);
    expect(filterItems(slashItems, "zzzz", label)).toEqual([]);
  });
});
describe("commands in the middle of text", () => {
  it("opens the menu after whitespace, not inside words or URLs", () => {
    expect(findTrigger("help me /sch", 12)).toEqual({ kind: "command", start: 8, query: "sch" });
    expect(findTrigger("and/or", 6)).toBeNull();
    expect(findTrigger("see https://x.org/abc", 21)).toBeNull();
  });
  it("replaces only the typed query and keeps the rest of the message and the caret", () => {
    const value = "next week /sch for Java";
    const trigger = findTrigger(value, 14)!;
    expect(applySelection(value, trigger, 14, "/schedule")).toEqual({
      value: "next week /schedule for Java",
      caret: 20,
    });
  });
  it("routes a mid-text command on the server exactly like a leading one", () => {
    expect(parseCommand("next week please /schedule Java after 7 PM")).toMatchObject({
      command: { name: "schedule" },
      rest: "next week please Java after 7 PM",
    });
    expect(planTurn("next week please /schedule Java after 7 PM").workflows[0]).toBe("schedule");
    expect(parseCommand("use and/or here").command).toBeNull();
    expect(highlightSegments("please /study recursion", [])).toEqual([
      { text: "please ", kind: "text" },
      { text: "/study", kind: "command" },
      { text: " recursion", kind: "text" },
    ]);
  });
  it("routes the new commands to real workflows with their tools", () => {
    expect(planTurn("/summarize @Notes", ["resource"]).tools).toContain("getStudyResources");
    expect(planTurn("/search joins").tools).toEqual(expect.arrayContaining(["getStudyResources", "getTopics"]));
    expect(planTurn("/analyze").workflows).toEqual(["review"]);
  });
});
describe("menu placement", () => {
  it("opens above a docked composer with room, capped to the visible space", () => {
    expect(placeMenu({ top: 700, bottom: 780 }, 800)).toEqual({ side: "top", maxHeight: 360 });
    expect(placeMenu({ top: 300, bottom: 380 }, 800)).toEqual({ side: "top", maxHeight: 292 });
  });
  it("opens below when there is more room below (composer near the top)", () => {
    expect(placeMenu({ top: 60, bottom: 140 }, 800)).toEqual({ side: "bottom", maxHeight: 360 });
  });
  it("never clips on a short mobile viewport with the keyboard open", () => {
    const { side, maxHeight } = placeMenu({ top: 180, bottom: 240 }, 300);
    expect(side).toBe("top");
    expect(maxHeight).toBeLessThanOrEqual(180);
    expect(maxHeight).toBeGreaterThanOrEqual(160);
  });
});
