"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GoalCard } from "@/lib/aven/validation";
import ActionCard, { CardFact } from "./ActionCard";
import { formatDay } from "./formatters";
import ProgressBar from "@/components/studyflow/ProgressBar";
export default function GoalProgressCard({ goal }: { goal: GoalCard }) {
  const t = useTranslations("aven.cards");
  return (
    <ActionCard
      eyebrow={t("goalProgress")}
      title={goal.title}
      status={
        <span className="aven-pill" data-tone={goal.health}>
          {t.has(`health.${goal.health}`)
            ? t(`health.${goal.health}`)
            : goal.health}
        </span>
      }
      footer={
        <Link href={`/goals/${goal.id}`} className="aven-text-button">
          {t("openGoal")}
        </Link>
      }
    >
      <ProgressBar
        value={goal.percent}
        label={t("progressLabel", { title: goal.title })}
      />
      <dl className="aven-facts">
        <CardFact label={t("progress")}>{goal.percent}%</CardFact>
        {goal.targetDate && (
          <CardFact label={t("targetDate")}>
            {formatDay(goal.targetDate)}
          </CardFact>
        )}
        {goal.nextTask && (
          <CardFact label={t("nextTask")}>{goal.nextTask}</CardFact>
        )}
      </dl>
      {goal.remainingMilestones.length > 0 && (
        <section>
          <h4 className="aven-card-section">{t("remainingMilestones")}</h4>
          <ul className="aven-card-list">
            {goal.remainingMilestones.map((title) => (
              <li key={title}>
                <span>{title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ActionCard>
  );
}
