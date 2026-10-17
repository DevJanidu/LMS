"use client";
import { useId } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
import {
  TECHNIQUES,
  TIMES_OF_DAY,
  targetSummary,
  type StudyTargetsData,
} from "@/lib/aven/ui-blocks";
import type { SavedState } from "@/lib/aven/ui-components";
import ActionCard, { CardFact } from "../cards/ActionCard";
import { useBlockEnvironment } from "./BlockContext";
import { useBlockState } from "./useBlockState";
import SaveIndicator from "./SaveIndicator";
type Values = Omit<StudyTargetsData, "title">;
interface Props {
  id: string;
  data: StudyTargetsData;
  requestId?: string;
  saved: SavedState<Values> | null;
  persist: boolean;
}
/** Sliders and choices with live arithmetic; nothing here calls the model. */
export default function StudyTargetsBlock({ id, data, requestId, saved, persist }: Props) {
  const t = useTranslations("aven.blocks"),
    field = useId();
  const { onCompose } = useBlockEnvironment();
  const { title, ...initial } = data;
  const state = useBlockState<Values>({ requestId, componentId: id, saved, initial, persist });
  const value = state.data,
    summary = targetSummary(value);
  const set = <K extends keyof Values>(key: K, next: Values[K]) =>
    state.update((current) => ({ ...current, [key]: next }));
  const slider = (key: "weeklyHours" | "sessionMinutes" | "breakMinutes", min: number, max: number, step: number) => (
    <div className="aven-slider">
      <label htmlFor={`${field}-${key}`} className="aven-field-label">
        {t(`targets.${key}`)}
        <output htmlFor={`${field}-${key}`} className="aven-slider-value">
          {t(`targets.${key}Value`, { value: value[key] })}
        </output>
      </label>
      <input
        id={`${field}-${key}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[key]}
        onChange={(event) => set(key, Number(event.target.value))}
      />
    </div>
  );
  return (
    <ActionCard
      eyebrow={t("targets.eyebrow")}
      title={title}
      footer={
        <>
          <Button
            size="sm"
            onClick={() =>
              onCompose(
                t("targets.planPrompt", {
                  hours: value.weeklyHours,
                  minutes: value.sessionMinutes,
                  breakMinutes: value.breakMinutes,
                  technique: t(`targets.techniques.${value.technique}`),
                  time: t(`targets.times.${value.timeOfDay}`),
                }),
              )
            }
          >
            {t("targets.plan")}
          </Button>
          <SaveIndicator status={state.status} />
        </>
      }
    >
      {slider("weeklyHours", 1, 60, 1)}
      {slider("sessionMinutes", 15, 180, 5)}
      {slider("breakMinutes", 0, 30, 1)}
      <fieldset className="aven-choice">
        <legend className="aven-field-label">{t("targets.technique")}</legend>
        <div className="aven-choice-options" role="radiogroup">
          {TECHNIQUES.map((technique) => (
            <label key={technique} className="aven-option" data-state={value.technique === technique ? "selected" : undefined}>
              <input
                type="radio"
                name={`${field}-technique`}
                checked={value.technique === technique}
                onChange={() => set("technique", technique)}
              />
              <span>{t(`targets.techniques.${technique}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="aven-select">
        <label htmlFor={`${field}-time`} className="aven-field-label">
          {t("targets.timeOfDay")}
        </label>
        <select
          id={`${field}-time`}
          className="aven-input"
          value={value.timeOfDay}
          onChange={(event) => set("timeOfDay", event.target.value as Values["timeOfDay"])}
        >
          {TIMES_OF_DAY.map((time) => (
            <option key={time} value={time}>
              {t(`targets.times.${time}`)}
            </option>
          ))}
        </select>
      </div>
      <dl className="aven-facts" aria-live="polite">
        <CardFact label={t("targets.sessionsPerWeek")}>{summary.sessionsPerWeek}</CardFact>
        <CardFact label={t("targets.perDay")}>{t("targets.minutes", { value: summary.perDayMinutes })}</CardFact>
        <CardFact label={t("targets.breaks")}>{t("targets.minutes", { value: summary.breakMinutesPerWeek })}</CardFact>
      </dl>
    </ActionCard>
  );
}
