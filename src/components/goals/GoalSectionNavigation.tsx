"use client";
import { useTranslations } from "next-intl";
export type GoalSection = "overview" | "tasks" | "milestones" | "studyPlan";
const sections: GoalSection[] = [
  "overview",
  "tasks",
  "milestones",
  "studyPlan",
];
interface Props {
  section: GoalSection;
  onChange: (section: GoalSection) => void;
}
export default function GoalSectionNavigation({ section, onChange }: Props) {
  const t = useTranslations("goals");
  return (
    <div
      className="goal-tabs"
      role="tablist"
      aria-label={t("workspace.sections")}
    >
      {sections.map((value, index) => (
        <button
          key={value}
          type="button"
          role="tab"
          id={`goal-tab-${value}`}
          aria-controls="goal-section-panel"
          aria-selected={section === value}
          tabIndex={section === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(event) => {
            let next = index;
            if (event.key === "ArrowRight")
              next = (index + 1) % sections.length;
            else if (event.key === "ArrowLeft")
              next = (index + sections.length - 1) % sections.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = sections.length - 1;
            else return;
            event.preventDefault();
            onChange(sections[next]);
            document.getElementById(`goal-tab-${sections[next]}`)?.focus();
          }}
        >
          {t(`workspace.sectionLabels.${value}`)}
        </button>
      ))}
    </div>
  );
}
