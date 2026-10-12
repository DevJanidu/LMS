"use client";
import { useTranslations } from "next-intl";
import { CalenderIcon, CommandIcon, SparklesIcon, TargetIcon } from "@/icons";
interface Suggestion {
  key: string;
  planning: boolean;
}
interface Props {
  hasGoals: boolean;
  disabled: boolean;
  onPick: (prompt: string, planning: boolean) => void;
}
const icons = {
  planDay: CalenderIcon,
  reviewGoals: TargetIcon,
  firstGoal: TargetIcon,
  organizeSchedule: CommandIcon,
  helpLearn: SparklesIcon,
};
export default function AvenSuggestions({ hasGoals, disabled, onPick }: Props) {
  const t = useTranslations("aven.suggestions");
  // Without goals, reviewing them is not useful; offer to create the first one instead.
  const items: Suggestion[] = [
    { key: "planDay", planning: false },
    { key: hasGoals ? "reviewGoals" : "firstGoal", planning: false },
    { key: "organizeSchedule", planning: true },
    { key: "helpLearn", planning: false },
  ];
  return (
    <div className="aven-suggestions">
      {items.map(({ key, planning }) => {
        const Icon = icons[key as keyof typeof icons];
        return (
          <button
            key={key}
            type="button"
            className="aven-suggestion"
            disabled={disabled}
            onClick={() => onPick(t(`${key}.prompt`), planning)}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>
              <span className="aven-suggestion-title">{t(`${key}.label`)}</span>
              <span className="aven-suggestion-hint">{t(`${key}.hint`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
