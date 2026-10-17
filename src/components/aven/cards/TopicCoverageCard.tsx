"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UiComponentData } from "@/lib/aven/ui-components";
import ProgressBar from "@/components/studyflow/ProgressBar";
import ActionCard, { CardFact } from "./ActionCard";
import { formatDay } from "./formatters";
type Coverage = UiComponentData<"topic_coverage">;
export default function TopicCoverageCard({ data }: { data: Coverage }) {
  const t = useTranslations("aven.cards");
  const { counts } = data,
    percent = counts.required
      ? Math.round((counts.completed / counts.required) * 100)
      : 0;
  return (
    <ActionCard
      eyebrow={t("topicCoverage")}
      title={data.subject.title}
      footer={
        <Link href={`/subjects/${data.subject.id}`} className="aven-text-button">
          {t("openSubject")}
        </Link>
      }
    >
      <ProgressBar
        value={percent}
        label={t("coverageLabel", {
          completed: counts.completed,
          total: counts.required,
        })}
      />
      <dl className="aven-facts">
        <CardFact label={t("topicsCompleted")}>
          {counts.completed}/{counts.required}
        </CardFact>
        <CardFact label={t("topicsInProgress")}>{counts.inProgress}</CardFact>
        <CardFact label={t("topicsRemaining")}>{counts.remaining}</CardFact>
        <CardFact label={t("topicsOverdue")}>{counts.overdue}</CardFact>
      </dl>
      {data.overdue.length > 0 && (
        <section>
          <h4 className="aven-card-section">{t("overdueTopics")}</h4>
          <ul className="aven-card-list">
            {data.overdue.map((topic) => (
              <li key={topic.id}>
                <span>{topic.title}</span>
                {topic.targetDate && (
                  <span className="aven-pill" data-tone="overdue">
                    {formatDay(topic.targetDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.nextTopics.length > 0 && (
        <section>
          <h4 className="aven-card-section">{t("nextTopics")}</h4>
          <ul className="aven-card-list">
            {data.nextTopics.map((topic) => (
              <li key={topic.id}>
                <span>{topic.title}</span>
                {topic.targetDate && (
                  <span className="aven-card-meta">
                    {formatDay(topic.targetDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </ActionCard>
  );
}
