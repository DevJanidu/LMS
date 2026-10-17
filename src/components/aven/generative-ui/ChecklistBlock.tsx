"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import ProgressBar from "@/components/studyflow/ProgressBar";
import { featureRequest } from "@/lib/goals/client";
import { checklistProgress, type ChecklistData } from "@/lib/aven/ui-blocks";
import type { SavedState } from "@/lib/aven/ui-components";
import ActionCard from "../cards/ActionCard";
import type { ProposalRecord } from "../ProposalCard";
import { errorKey } from "../types";
import { useBlockEnvironment } from "./BlockContext";
import { useBlockState } from "./useBlockState";
import SaveIndicator from "./SaveIndicator";
type State = { checked: string[]; collapsed: string[] };
const EMPTY: State = { checked: [], collapsed: [] };
interface Props {
  id: string;
  data: ChecklistData;
  requestId?: string;
  saved: SavedState<State> | null;
  persist: boolean;
}
/** Real checkboxes with live counts; ticking saves locally first and never calls the model. */
export default function ChecklistBlock({ id, data, requestId, saved, persist }: Props) {
  const t = useTranslations("aven.blocks"),
    root = useTranslations("aven"),
    labelId = useId();
  const { conversationId, onProposals } = useBlockEnvironment();
  const state = useBlockState<State>({ requestId, componentId: id, saved, initial: EMPTY, persist });
  const checked = new Set(state.data.checked),
    collapsed = new Set(state.data.collapsed);
  const progress = checklistProgress(data, checked);
  const [saving, setSaving] = useState(false),
    [goalDate, setGoalDate] = useState(""),
    [askDate, setAskDate] = useState(false),
    [error, setError] = useState("");
  const toggle = (item: string) =>
    state.update((current) => ({
      ...current,
      checked: current.checked.includes(item)
        ? current.checked.filter((value) => value !== item)
        : [...current.checked, item],
    }));
  const toggleSection = (section: string) =>
    state.update((current) => ({
      ...current,
      collapsed: current.collapsed.includes(section)
        ? current.collapsed.filter((value) => value !== section)
        : [...current.collapsed, section],
    }));
  const saveAsGoal = async () => {
    if (!conversationId || !requestId || !goalDate || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await featureRequest<{ proposal: ProposalRecord }>("/api/aven/components", {
        kind: "saveChecklist",
        conversationId,
        requestId,
        componentId: id,
        targetDate: goalDate,
      });
      onProposals([{ ...response.proposal, createdAt: new Date().toISOString() }]);
      setAskDate(false);
    } catch (failure) {
      setError(root(errorKey(root, (failure as Error).message)));
    } finally {
      setSaving(false);
    }
  };
  return (
    <ActionCard
      eyebrow={t("checklist")}
      title={<span id={labelId}>{data.title}</span>}
      status={
        <span className="aven-pill" data-tone={progress.complete === progress.total ? "completed" : "pending"}>
          {t("doneCount", { done: progress.complete, total: progress.total })}
        </span>
      }
      footer={
        <>
          {state.canSave && !askDate && (
            <Button size="sm" variant="outline" onClick={() => setAskDate(true)}>
              {t("saveAsGoal")}
            </Button>
          )}
          {askDate && (
            <span className="aven-inline-form">
              <label className="aven-field-label" htmlFor={`${id}-date`}>
                {t("goalDate")}
              </label>
              <input
                id={`${id}-date`}
                type="date"
                className="aven-input"
                value={goalDate}
                onChange={(event) => setGoalDate(event.target.value)}
              />
              <Button size="sm" disabled={!goalDate || saving} onClick={() => void saveAsGoal()}>
                {t("prepareGoal")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAskDate(false)}>
                {t("cancel")}
              </Button>
            </span>
          )}
          {progress.complete > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => state.update((current) => ({ ...current, checked: [] }))}
            >
              {t("reset")}
            </Button>
          )}
          <SaveIndicator status={state.status} />
        </>
      }
    >
      <ProgressBar value={progress.percent} label={t("progressLabel", { title: data.title })} />
      <div className="aven-checklist" aria-labelledby={labelId}>
        {data.sections.map((section, index) => {
          const counts = progress.sections[index],
            open = !collapsed.has(section.id);
          return (
            <section key={section.id} className="aven-checklist-section">
              <button
                type="button"
                className="aven-checklist-heading"
                aria-expanded={open}
                aria-controls={`${id}-${section.id}`}
                onClick={() => toggleSection(section.id)}
              >
                <ChevronDownIcon className="size-4" aria-hidden="true" />
                <span className="flex-1">{section.title}</span>
                <span className="aven-card-meta">
                  {t("doneCount", { done: counts.done, total: counts.total })}
                </span>
              </button>
              {open && (
                <ul id={`${id}-${section.id}`} className="aven-checklist-items">
                  {section.items.map((item) => (
                    <li key={item.id} data-done={checked.has(item.id) || undefined}>
                      <label className="aven-checklist-item">
                        <input
                          type="checkbox"
                          className="aven-checkbox"
                          checked={checked.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <span>
                          <span className="aven-checklist-label">{item.label}</span>
                          {item.hint && <span className="aven-card-meta block">{item.hint}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="aven-block-error">
          {error}
        </p>
      )}
    </ActionCard>
  );
}
