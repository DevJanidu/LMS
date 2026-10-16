"use client";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { useTranslations } from "next-intl";
import { CheckIcon, SlidersIcon } from "@/icons";
import SegmentedControl from "@/components/ui/SegmentedControl";
import SettingsCard from "./SettingsCard";
import SettingRow from "./SettingRow";
import StudyGoalField from "./StudyGoalField";
import type { DraftChange, SettingsDraft } from "./draft";

interface Props { draft: SettingsDraft; onChange: DraftChange }
const THEMES = ["light", "dark", "auto"] as const;

export default function PreferencesSection({ draft, onChange }: Props) {
  const t = useTranslations("settings");
  return (
    <SettingsCard id="settings-preferences" icon={<SlidersIcon />} title={t("preferences.title")} description={t("preferences.description")}>
      <div className="sf-set-block">
        <p className="sf-set-label" id="settings-theme-label">{t("preferences.theme")}</p>
        <RadioGroup.Root className="sf-set-themes" aria-labelledby="settings-theme-label" value={draft.theme} onValueChange={value => onChange({ theme: value as SettingsDraft["theme"] })}>
          {THEMES.map(mode => (
            <RadioGroup.Item key={mode} value={mode} className="sf-set-theme">
              {/* A miniature workspace: sidebar, header bar and two content lines. */}
              <span className="sf-set-theme-preview" data-mode={mode} aria-hidden="true">
                <span className="sf-set-theme-side" /><span className="sf-set-theme-bar" /><span className="sf-set-theme-line" /><span className="sf-set-theme-line" data-short />
              </span>
              <span className="sf-set-theme-name">
                {t(`preferences.themes.${mode}`)}
                <span className="sf-set-theme-check" aria-hidden="true"><CheckIcon /></span>
              </span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>
      <SettingRow id="settings-week" label={t("preferences.weekStarts")} description={t("preferences.weekStartsHelp")}>
        <SegmentedControl aria-labelledby="settings-week-label" value={String(draft.weekStartDay) as "0" | "1"}
          options={[{ value: "1", label: t("preferences.monday") }, { value: "0", label: t("preferences.sunday") }]}
          onChange={value => onChange({ weekStartDay: Number(value) as 0 | 1 })} />
      </SettingRow>
      <SettingRow id="settings-goal" label={t("preferences.weeklyGoal")} description={t("preferences.weeklyGoalHelp")} stacked>
        <StudyGoalField minutes={draft.weeklyTargetMinutes} onChange={weeklyTargetMinutes => onChange({ weeklyTargetMinutes })} />
      </SettingRow>
    </SettingsCard>
  );
}
