"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SparklesIcon } from "@/icons";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
interface Props {
  detail: GoalDetail;
  references: GoalReferences;
  onEdit: () => void;
}
export default function GoalContextPanel({
  detail,
  references,
  onEdit,
}: Props) {
  const t = useTranslations("goals");
  const subjects = references.subjects.filter((subject) =>
    detail.goal.subjectIds.includes(subject.id),
  );
  const resources = references.resources.filter((resource) =>
    detail.goal.resourceIds.includes(resource.id),
  );
  return (
    <aside className="goal-context">
      <section className="goal-panel goal-guidance">
        <div className="goal-section-heading">
          <h2>{t("workspace.guidance")}</h2>
          <SparklesIcon className="size-5" aria-hidden="true" />
        </div>
        <p>{t("workspace.guidanceHelp")}</p>
        <Link
          href={`/aven?goal=${detail.goal.id}&intent=next`}
          className="sf-action-primary"
        >
          {t("workspace.askWithContext")}
        </Link>
        <details className="goal-guidance-options">
          <summary>{t("workspace.moreGuidance")}</summary>
          <div>
            {["plan", "review", "next", "recovery", "schedule"].map(
              (intent) => (
                <Link
                  key={intent}
                  href={`/aven?goal=${detail.goal.id}&intent=${intent}`}
                >
                  {t(`avenActions.${intent}`)}
                </Link>
              ),
            )}
          </div>
        </details>
      </section>
      <section className="goal-panel">
        <h2>{t("linkedLearning")}</h2>
        <div className="goal-linked-list">
          {subjects.map((subject) => (
            <Link key={subject.id} href={`/subjects/${subject.id}`}>
              {subject.title}
            </Link>
          ))}
          {references.topics
            .filter((topic) => detail.goal.topicIds.includes(topic.id))
            .map((topic) => (
              <Link key={topic.id} href={`/subjects/${topic.subjectId}`}>
                {topic.title}
              </Link>
            ))}
          {resources.map((resource) => (
            <Link
              key={resource.id}
              href={`/resources?search=${encodeURIComponent(resource.title)}`}
            >
              {resource.title}
            </Link>
          ))}
        </div>
        {!subjects.length &&
          !resources.length &&
          !detail.goal.topicIds.length && (
            <>
              <p className="goal-empty-inline">{t("workspace.noLinks")}</p>
              <button className="goal-text-action" onClick={onEdit}>
                {t("workspace.linkLearning")}
              </button>
            </>
          )}
      </section>
    </aside>
  );
}
