"use client";
import { useId } from "react";
import { useTranslations } from "next-intl";
import SegmentedControl from "@/components/ui/SegmentedControl";
import type { ConfidenceLevel } from "@/lib/learning/signals";
export type ConfidenceChoice = ConfidenceLevel | "skip";
interface Props {
  value: ConfidenceChoice;
  onChange: (value: ConfidenceChoice) => void;
}
/** Optional after-session check; "Skip" sends nothing. */
export default function ConfidenceCheck({ value, onChange }: Props) {
  const t = useTranslations("aven.learning"),
    labelId = useId(),
    helpId = useId();
  return (
    <div className="space-y-2">
      <p
        id={labelId}
        className="text-theme-sm font-medium text-gray-800 dark:text-white/90"
      >
        {t("confidenceQuestion")}
      </p>
      <SegmentedControl
        aria-labelledby={labelId}
        value={value}
        onChange={onChange}
        options={[
          { value: "skip", label: t("confidenceSkip") },
          { value: "needsPractice", label: t("levels.needsPractice") },
          { value: "gettingThere", label: t("levels.gettingThere") },
          { value: "confident", label: t("levels.confident") },
        ]}
      />
      <p id={helpId} className="text-theme-xs text-gray-500 dark:text-gray-400">
        {t("confidenceHelp")}
      </p>
    </div>
  );
}
