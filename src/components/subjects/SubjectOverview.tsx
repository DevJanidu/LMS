"use client";
import TextLink from "@/components/studyflow/TextLink";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getResources, getSessions, getTopics } from "@/lib/workspace/queries";
import { dailySeconds, localDay, shiftDay } from "@/lib/analytics";
import { useNow } from "@/lib/workspace/store";
import type { Workspace } from "@/types";
import { primaryLink } from "@/components/studyflow/styles";
import ComponentCard from "@/components/common/ComponentCard";
import StudyChart from "@/components/analytics/StudyChart";
import SessionTable from "@/components/study/SessionTable";
interface Props {
  data: Workspace;
  subjectId: string;
}
export default function SubjectOverview({ data, subjectId }: Props) {
  const t = useTranslations("studyflow");
  const clock = useNow(60000);
  const today = localDay(clock || data.user.lastActiveAt, data.user.timezone);
  const topics = getTopics(data, subjectId).filter(
    (topic) => topic.status !== "completed",
  );
  const next =
    topics.find((topic) => topic.status === "inProgress") ?? topics[0];
  const sessions = getSessions(data).filter((s) => s.subjectId === subjectId);
  const totals = data.analytics?.subjectDaily[subjectId] ?? dailySeconds(sessions, data.user.timezone);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
  const resources = getResources(data).filter((r) => r.subjectId === subjectId);
  return (
    <div className="sf-subject-overview">
      <ComponentCard title={t("redesign.upNext")}>
        <h2 className="text-h2">
          {next?.title ?? t("redesign.allComplete")}
        </h2>
        <Link
          href={`/study?subject=${subjectId}&topic=${next?.id ?? ""}`}
          className={primaryLink}
        >
          {t("continueLearning")}
        </Link>
        <div className="space-y-3">
          {topics
            .filter((topic) => topic.id !== next?.id)
            .slice(0, 3)
            .map((topic, index) => (
              <div key={topic.id} className="flex items-center gap-3 text-body">
                <span className="text-muted">
                  {String(index + 2).padStart(2, "0")}
                </span>
                {topic.title}
              </div>
            ))}
        </div>
      </ComponentCard>
      <ComponentCard title={t("dailyStudyTime")}>
        <StudyChart
          labels={days.map((d) => d.slice(5))}
          values={days.map((d) => Math.round((totals[d] ?? 0) / 60))}
          label={t("minutes")}
        />
      </ComponentCard>
      <ComponentCard title={t("recentSessions")}>
        <SessionTable data={data} sessions={sessions.slice(0, 3)} />
      </ComponentCard>
      <ComponentCard title={t("resources")}>
        <p className="text-muted text-body">
          {t("redesign.savedResources", { count: data.resourceCounts?.[subjectId] ?? resources.length })}
        </p>
        {resources.slice(0, 4).map((resource) => (
          <Link
            key={resource.id}
            href={`/resources?search=${encodeURIComponent(resource.title)}`}
            className="sf-agenda-item text-body"
          >
            <span className="text-muted">{t(resource.type)}</span>
            {resource.title}
          </Link>
        ))}
        <TextLink
          href="/resources?add=1"
        >
          {t("addResource")}
        </TextLink>
      </ComponentCard>
    </div>
  );
}
