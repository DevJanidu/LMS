"use client";
import { useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "@/icons";
import { dailyShare } from "./draft";

interface Props { minutes: number; onChange: (minutes: number) => void }
const STEP = 30, MAX = 168 * 60, PRESETS = [5, 10, 15, 20];

/** Weekly goal in half-hour steps, with quick presets and a per-day breakdown. */
export default function StudyGoalField({ minutes, onChange }: Props) {
  const t = useTranslations("settings");
  const hours = minutes / 60;
  const share = dailyShare(minutes);
  const set = (next: number) => onChange(Math.min(MAX, Math.max(0, next)));
  return (
    <div className="sf-set-goal" role="group" aria-labelledby="settings-goal-label">
      <div className="sf-set-goal-main">
        <button type="button" className="sf-set-step" aria-label={t("preferences.goalLess")} disabled={minutes <= 0} onClick={() => set(minutes - STEP)}><MinusIcon /></button>
        <output className="sf-set-goal-value" aria-live="polite">
          <span className="tabular-nums">{Number.isInteger(hours) ? hours : hours.toFixed(1)}</span>
          <span className="sf-set-goal-unit">{t("preferences.hoursPerWeek")}</span>
        </output>
        <button type="button" className="sf-set-step" aria-label={t("preferences.goalMore")} disabled={minutes >= MAX} onClick={() => set(minutes + STEP)}><PlusIcon /></button>
      </div>
      <div className="sf-set-chips" role="group" aria-label={t("preferences.goalPresets")}>
        <button type="button" className="sf-set-chip" aria-pressed={minutes === 0} onClick={() => set(0)}>{t("preferences.noGoal")}</button>
        {PRESETS.map(preset => (
          <button key={preset} type="button" className="sf-set-chip" aria-pressed={minutes === preset * 60} onClick={() => set(preset * 60)}>
            {t("preferences.presetHours", { hours: preset })}
          </button>
        ))}
      </div>
      <p className="sf-set-help tabular-nums">{minutes ? t("preferences.goalDaily", share) : t("preferences.goalNone")}</p>
    </div>
  );
}
