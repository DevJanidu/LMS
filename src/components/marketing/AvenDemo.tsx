"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, ArrowUpIcon, CalenderIcon, CheckIcon, SparklesIcon, TargetIcon } from "@/icons";

interface Milestone {
  title: string;
  weeks: string;
  tasks: string[];
}
interface Session {
  day: string;
  time: string;
  title: string;
  minutes: number;
}
interface Scenario {
  id: string;
  label: string;
  prompt: string;
  interpretation: string;
  facts: { label: string; value: string }[];
  proposalIntro: string;
  milestones: Milestone[];
  scheduleIntro: string;
  sessions: Session[];
  weeklyHours: string;
  goalTitle: string;
  due: string;
}

/** 0 goal · 1 understanding · 2 milestones · 3 schedule · 4 workspace */
type Stage = 0 | 1 | 2 | 3 | 4;
type Tab = "milestones" | "schedule" | "workspace";
const STEPS = ["goal", "understand", "milestones", "schedule", "workspace"] as const;

/**
 * Scripted Aven walkthrough. Runs entirely in the browser from pre-written
 * scenarios — no model is called for anonymous visitors.
 */
export default function AvenDemo() {
  const t = useTranslations("marketing.demo");
  const scenarios = t.raw("scenarios") as Scenario[];
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [stage, setStage] = useState<Stage>(0);
  const [sent, setSent] = useState(false);
  const [typing, setTyping] = useState(false);
  const [tab, setTab] = useState<Tab>("milestones");
  const timers = useRef<number[]>([]);
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const later = (ms: number, fn: () => void) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    timers.current.push(window.setTimeout(fn, reduced ? 0 : ms));
  };

  const choose = (id: string) => {
    clearTimers();
    setScenarioId(id);
    setStage(0);
    setSent(false);
    setTyping(false);
    setTab("milestones");
  };

  const send = () => {
    if (sent) return;
    setSent(true);
    setTyping(true);
    later(700, () => {
      setTyping(false);
      setStage(1);
      later(900, () => setTyping(true));
      later(1700, () => {
        setTyping(false);
        setStage(2);
        setTab("milestones");
      });
    });
  };

  const acceptMilestones = () => {
    setTyping(true);
    later(800, () => {
      setTyping(false);
      setStage(3);
      setTab("schedule");
    });
  };

  const approveSchedule = () => {
    setStage(4);
    setTab("workspace");
  };

  const tabStage: Record<Tab, Stage> = { milestones: 2, schedule: 3, workspace: 4 };

  return (
    <div className="mk-demo">
      <div className="flex flex-col gap-4 border-b mk-hairline px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="mk-aven-mark"><SparklesIcon /></span>
          <div>
            <h3 className="text-h3">{t("title")}</h3>
            <p className="text-small mk-muted">{t("subtitle")}</p>
          </div>
        </div>
        <ol className="mk-steps" aria-label={t("progressLabel")}>
          {STEPS.map((step, index) => {
            const state = index < stage || stage === STEPS.length - 1 ? "done" : index === stage ? "active" : "todo";
            return (
              <li key={step} className="mk-step" data-state={state} aria-current={state === "active" ? "step" : undefined}>
                <i>{state === "done" ? <CheckIcon /> : index + 1}</i>
                {t(`steps.${step}`)}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mk-demo-grid">
        <div className="mk-demo-chat">
          <div className="flex flex-wrap gap-2 px-5 pt-5" role="group" aria-label={t("scenariosLabel")}>
            {scenarios.map((item) => (
              <button key={item.id} type="button" className="mk-scenario" aria-pressed={item.id === scenarioId} onClick={() => choose(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-3 px-5 py-5" aria-live="polite">
            {!sent && <p className="m-auto max-w-xs text-center text-small mk-muted">{t("emptyChat")}</p>}
            {sent && <p className="mk-bubble mk-bubble-user mk-enter">{scenario.prompt}</p>}
            {stage >= 1 && (
              <AvenBubble>
                <p>{scenario.interpretation}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  {scenario.facts.map((fact) => (
                    <div key={fact.label} className="rounded-lg mk-bg-subtle px-2.5 py-1.5">
                      <dt className="text-caption mk-muted">{fact.label}</dt>
                      <dd className="text-small font-medium">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </AvenBubble>
            )}
            {stage >= 2 && <AvenBubble>{scenario.proposalIntro}</AvenBubble>}
            {stage >= 3 && <AvenBubble>{scenario.scheduleIntro}</AvenBubble>}
            {stage >= 4 && <AvenBubble>{t("doneMessage")}</AvenBubble>}
            {typing && (
              <div className="flex items-end gap-2">
                <span className="mk-aven-mark mk-aven-mark-sm"><SparklesIcon /></span>
                <span className="mk-bubble mk-bubble-aven mk-typing" aria-label={t("typing")}><i /><i /><i /></span>
              </div>
            )}
          </div>
          <div className="px-5 pb-5">
            <div className="mk-composer">
              <p className={sent ? "mk-muted" : ""}>{sent ? t("composerPlaceholder") : scenario.prompt}</p>
              <button type="button" className="mk-send" onClick={send} disabled={sent} aria-label={t("send")}>
                <ArrowUpIcon />
              </button>
            </div>
            <p className="mt-2 text-caption mk-muted">{t("note")}</p>
          </div>
        </div>

        <div className="mk-demo-result flex flex-col p-5">
          <div className="mk-tabs" role="tablist" aria-label={t("resultLabel")}>
            {(Object.keys(tabStage) as Tab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`mk-demo-tab-${key}`}
                aria-controls="mk-demo-panel"
                aria-selected={tab === key && stage >= tabStage[key]}
                disabled={stage < tabStage[key]}
                onClick={() => setTab(key)}
              >
                {t(`tabs.${key}`)}
              </button>
            ))}
          </div>
          <div id="mk-demo-panel" role="tabpanel" aria-labelledby={`mk-demo-tab-${tab}`} className="mt-4 flex flex-1 flex-col">
            {stage < 2 && <EmptyResult label={t("emptyResult")} busy={sent} busyLabel={t("planning")} />}
            {stage >= 2 && tab === "milestones" && (
              <div key="milestones" className="mk-enter grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-body-strong">{t("proposalTitle")}</p>
                  <span className="mk-chip mk-chip-warning">{stage === 2 ? t("awaitingReview") : t("accepted")}</span>
                </div>
                <ol className="grid gap-2">
                  {scenario.milestones.map((milestone, index) => (
                    <li key={milestone.title} className="rounded-xl mk-bg-surface p-3 mk-outline">
                      <div className="flex items-center gap-3">
                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-50 text-caption text-brand-500 dark:bg-brand-950 dark:text-brand-300">{index + 1}</span>
                        <p className="min-w-0 flex-1 text-small font-medium">{milestone.title}</p>
                        <span className="text-caption mk-muted">{milestone.weeks}</span>
                      </div>
                      <p className="mt-1.5 ps-9 text-caption mk-muted">{milestone.tasks.join(" · ")}</p>
                    </li>
                  ))}
                </ol>
                {stage === 2 && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" className="mk-btn mk-btn-primary mk-btn-sm" onClick={acceptMilestones} disabled={typing}>
                      <CheckIcon />{t("acceptMilestones")}
                    </button>
                    <span className="text-caption mk-muted">{t("reviewNote")}</span>
                  </div>
                )}
              </div>
            )}
            {stage >= 3 && tab === "schedule" && (
              <div key="schedule" className="mk-enter grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-body-strong">{t("scheduleTitle")}</p>
                  <span className="mk-chip mk-chip-brand"><CalenderIcon className="size-3" />{scenario.weeklyHours}</span>
                </div>
                <ul className="grid gap-2">
                  {scenario.sessions.map((session) => (
                    <li key={session.day + session.time} className="flex items-center gap-3 rounded-xl mk-bg-surface p-3 mk-outline">
                      <span className="w-10 shrink-0 text-caption font-semibold text-brand-500 dark:text-brand-300">{session.day}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-medium">{session.title}</span>
                        <span className="block text-caption mk-muted">{session.time}</span>
                      </span>
                      <span className="mk-chip">{t("minutes", { minutes: session.minutes })}</span>
                    </li>
                  ))}
                </ul>
                {stage === 3 && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" className="mk-btn mk-btn-primary mk-btn-sm" onClick={approveSchedule}>
                      <CheckIcon />{t("approveSchedule")}
                    </button>
                    <span className="text-caption mk-muted">{t("reviewNote")}</span>
                  </div>
                )}
              </div>
            )}
            {stage >= 4 && tab === "workspace" && (
              <div key="workspace" className="mk-enter grid gap-3">
                <div className="rounded-xl mk-bg-surface p-4 mk-outline">
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-300"><TargetIcon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-strong">{scenario.goalTitle}</p>
                      <p className="text-caption mk-muted">{scenario.due}</p>
                    </div>
                    <span className="mk-chip mk-chip-success">{t("active")}</span>
                  </div>
                  <div className="mk-bar mt-4"><i className="w-[4%]" /></div>
                  <ul className="mt-4 grid gap-2">
                    {scenario.milestones.slice(0, 4).map((milestone, index) => (
                      <li key={milestone.title} className="flex items-center gap-2 text-small">
                        <span className="mk-check" />
                        <span className="min-w-0 flex-1 truncate">{milestone.title}</span>
                        <span className={`mk-chip ${index === 0 ? "mk-chip-brand" : ""}`}>{index === 0 ? t("upNext") : milestone.weeks}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl mk-bg-surface p-4 mk-outline">
                  <p className="text-caption mk-muted">{t("nextSession")}</p>
                  <p className="mt-1 text-small font-medium">{scenario.sessions[0].title} · {scenario.sessions[0].day} {scenario.sessions[0].time}</p>
                </div>
                <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                  <Link href="/login" className="mk-btn mk-btn-primary">{t("cta")}<ArrowRightIcon /></Link>
                  <button type="button" className="mk-btn mk-btn-ghost" onClick={() => choose(scenario.id)}>{t("replay")}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-3 border-t mk-hairline px-5 py-3 text-caption mk-muted">
        <span className="mk-example-tag">{t("exampleTag")}</span>
        {t("disclaimer")}
      </p>
    </div>
  );
}

function AvenBubble({ children }: { children: ReactNode }) {
  return (
    <div className="mk-enter flex items-end gap-2">
      <span className="mk-aven-mark mk-aven-mark-sm"><SparklesIcon /></span>
      <div className="mk-bubble mk-bubble-aven">{children}</div>
    </div>
  );
}

function EmptyResult({ label, busy, busyLabel }: { label: string; busy: boolean; busyLabel: string }) {
  return (
    <div className="m-auto flex max-w-xs flex-col items-center gap-3 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-xl mk-bg-surface text-brand-500 mk-outline dark:text-brand-300">
        <TargetIcon className="size-5" />
      </span>
      <p className="text-small mk-muted">{busy ? busyLabel : label}</p>
    </div>
  );
}
