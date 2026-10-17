"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
import { featureRequest } from "@/lib/goals/client";
import { plannerTotals, plannerWindows, type StudyPlannerData } from "@/lib/aven/ui-blocks";
import type { SavedState } from "@/lib/aven/ui-components";
import ActionCard, { CardFact } from "../cards/ActionCard";
import { formatDay } from "../cards/formatters";
import type { ProposalRecord } from "../ProposalCard";
import { errorKey } from "../types";
import { useBlockEnvironment } from "./BlockContext";
interface Props {
  id: string;
  data: StudyPlannerData;
  requestId?: string;
  saved: SavedState<StudyPlannerData> | null;
}
const duration = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
/**
 * Adjust a real scheduling proposal. Totals recalculate locally as controls move; "Update
 * preview" re-runs the deterministic planner against the live calendar (no model call)
 * and replaces the draft. Saving still happens only through the approval card.
 */
export default function StudyPlannerBlock({ id, data, requestId, saved }: Props) {
  const t = useTranslations("aven.blocks"),
    root = useTranslations("aven"),
    field = useId();
  const { conversationId, onProposals, onSaved } = useBlockEnvironment();
  // The newest version wins: this tab's last re-plan or one saved elsewhere.
  const [mine, setMine] = useState<SavedState<StudyPlannerData> | null>(null);
  const plan = (mine && mine.v >= (saved?.v ?? 0) ? mine : saved)?.data ?? data;
  const [minutes, setMinutes] = useState(plan.minutes),
    [window, setWindow] = useState(plan.window),
    [counts, setCounts] = useState<Record<string, number>>(
      Object.fromEntries(plan.subjects.map((subject) => [subject.subjectId, subject.sessions])),
    ),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const subjects = plan.subjects.map((subject) => ({ ...subject, sessions: counts[subject.subjectId] ?? subject.sessions }));
  const totals = plannerTotals(subjects, minutes);
  const changed =
    minutes !== plan.minutes ||
    window !== plan.window ||
    subjects.some((subject, index) => subject.sessions !== plan.subjects[index].sessions);
  const days = plan.studyDays.length || 7;
  const overTarget = plan.dailyTargetMinutes > 0 && totals.minutes > plan.dailyTargetMinutes * days;
  const update = async () => {
    if (!conversationId || !requestId || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await featureRequest<{
        planned: boolean;
        reason?: string;
        proposal?: ProposalRecord;
        state?: SavedState<StudyPlannerData>;
      }>("/api/aven/components", {
        kind: "replan",
        conversationId,
        requestId,
        componentId: id,
        minutes,
        window,
        subjects: subjects.map(({ subjectId, sessions }) => ({ subjectId, sessions })),
      });
      if (!response.planned) setNotice(t(`planner.reasons.${response.reason ?? "noFreeTime"}`));
      else if (response.proposal) {
        if (response.state) setMine(response.state);
        onProposals([{ ...response.proposal, createdAt: new Date().toISOString() }], [plan.proposalId]);
        onSaved();
        setNotice(t("planner.updated"));
      }
    } catch (failure) {
      setError(root(errorKey(root, (failure as Error).message)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ActionCard
      eyebrow={t("planner.eyebrow")}
      title={t("planner.title", { from: formatDay(plan.from), to: formatDay(plan.to) })}
      footer={
        <>
          <Button size="sm" disabled={!changed || busy || !conversationId} onClick={() => void update()}>
            {t(busy ? "planner.updating" : "planner.update")}
          </Button>
          {notice && (
            <span className="aven-save-status" role="status">
              {notice}
            </span>
          )}
        </>
      }
    >
      <dl className="aven-facts" aria-live="polite">
        <CardFact label={t("planner.sessions")}>{totals.sessions}</CardFact>
        <CardFact label={t("planner.total")}>{duration(totals.minutes)}</CardFact>
        <CardFact label={t("planner.placed")}>
          {t("planner.placedValue", { placed: plan.placed, requested: plan.placed + plan.unplaced })}
        </CardFact>
      </dl>
      <div className="aven-slider">
        <label htmlFor={`${field}-minutes`} className="aven-field-label">
          {t("planner.sessionLength")}
          <output htmlFor={`${field}-minutes`} className="aven-slider-value">
            {duration(minutes)}
          </output>
        </label>
        <input id={`${field}-minutes`} type="range" min={15} max={120} step={5} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
      </div>
      {subjects.map((subject) => (
        <div key={subject.subjectId} className="aven-slider">
          <label htmlFor={`${field}-${subject.subjectId}`} className="aven-field-label">
            {subject.title}
            <output htmlFor={`${field}-${subject.subjectId}`} className="aven-slider-value">
              {t("planner.sessionCount", { count: subject.sessions })}
            </output>
          </label>
          <input
            id={`${field}-${subject.subjectId}`}
            type="range"
            min={1}
            max={7}
            step={1}
            value={subject.sessions}
            onChange={(event) => setCounts((current) => ({ ...current, [subject.subjectId]: Number(event.target.value) }))}
          />
        </div>
      ))}
      <fieldset className="aven-choice">
        <legend className="aven-field-label">{t("planner.window")}</legend>
        <div className="aven-choice-options" role="radiogroup">
          {plannerWindows.map((option) => (
            <label key={option} className="aven-option" data-state={window === option ? "selected" : undefined}>
              <input type="radio" name={`${field}-window`} checked={window === option} onChange={() => setWindow(option)} />
              <span>{option === "requested" ? t("planner.requested", { from: data.earliest, to: data.latest }) : t(`planner.windows.${option}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {overTarget && <p className="aven-card-warning">{t("planner.overTarget", { minutes: plan.dailyTargetMinutes })}</p>}
      {plan.unplaced > 0 && (
        <div className="aven-card-warning">
          <p>{t("planner.unplaced", { count: plan.unplaced })}</p>
          {plan.tradeoffs.length > 0 && (
            <ul className="aven-card-list">
              {plan.tradeoffs.map((item) => (
                <li key={`${item.title}-${item.localStartsAt}`}>
                  <span>{item.title}</span>
                  <span className="aven-card-meta">{item.localStartsAt.replace("T", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="aven-card-note">{t("planner.approveBelow")}</p>
      {error && (
        <p role="alert" className="aven-block-error">
          {error}
        </p>
      )}
    </ActionCard>
  );
}
