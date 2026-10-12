import { getTranslations } from "next-intl/server";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay } from "@/lib/analytics";
import { Link } from "@/i18n/navigation";
import DashboardPanel, { PanelEmpty } from "./DashboardPanel";
interface Deadline {
  id: string;
  title: string;
  date: string;
  context: string | null;
  high: boolean;
  href: string;
}
const ACTIVE_GOALS = ["active", "planned", "missedTarget"];
/** Goal tasks, goals, topics and subjects due soonest, from the learner's own records. */
export async function upcomingDeadlines(userId: string, timezone: string) {
  const db = getDb(),
    today = localDay(Date.now(), timezone);
  const [tasks, goalRows, topics, subjects] = await Promise.all([
    db
      .select({
        id: s.goalTasks.id,
        title: s.goalTasks.title,
        date: s.goalTasks.dueDate,
        priority: s.goalTasks.priority,
        goalId: s.goals.id,
        goalTitle: s.goals.title,
        subject: s.subjects.title,
      })
      .from(s.goalTasks)
      .innerJoin(s.goals, eq(s.goals.id, s.goalTasks.goalId))
      .leftJoin(s.subjects, eq(s.subjects.id, s.goalTasks.subjectId))
      .where(
        and(
          eq(s.goals.userId, userId),
          inArray(s.goals.status, ACTIVE_GOALS),
          sql`${s.goalTasks.status} NOT IN ('completed','cancelled')`,
          gte(s.goalTasks.dueDate, today),
        ),
      )
      .orderBy(asc(s.goalTasks.dueDate))
      .limit(5),
    db
      .select({
        id: s.goals.id,
        title: s.goals.title,
        date: s.goals.targetDate,
        priority: s.goals.priority,
      })
      .from(s.goals)
      .where(
        and(
          eq(s.goals.userId, userId),
          inArray(s.goals.status, ACTIVE_GOALS),
          gte(s.goals.targetDate, today),
        ),
      )
      .orderBy(asc(s.goals.targetDate))
      .limit(5),
    db
      .select({
        id: s.topics.id,
        title: s.topics.title,
        date: s.topics.targetDate,
        subjectId: s.subjects.id,
        subject: s.subjects.title,
      })
      .from(s.topics)
      .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
      .where(
        and(
          eq(s.subjects.userId, userId),
          eq(s.subjects.status, "active"),
          eq(s.topics.archived, false),
          sql`${s.topics.status} <> 'completed'`,
          gte(s.topics.targetDate, today),
        ),
      )
      .orderBy(asc(s.topics.targetDate))
      .limit(5),
    db
      .select({
        id: s.subjects.id,
        title: s.subjects.title,
        date: s.subjects.targetDate,
      })
      .from(s.subjects)
      .where(
        and(
          eq(s.subjects.userId, userId),
          eq(s.subjects.status, "active"),
          gte(s.subjects.targetDate, today),
        ),
      )
      .orderBy(asc(s.subjects.targetDate))
      .limit(5),
  ]);
  const items: Deadline[] = [
    ...tasks.map((row) => ({
      id: `task:${row.id}`,
      title: row.title,
      date: row.date!,
      context: row.subject ?? row.goalTitle,
      high: row.priority === "high",
      href: `/goals/${row.goalId}`,
    })),
    ...goalRows.map((row) => ({
      id: `goal:${row.id}`,
      title: row.title,
      date: row.date,
      context: null,
      high: row.priority === "high",
      href: `/goals/${row.id}`,
    })),
    ...topics.map((row) => ({
      id: `topic:${row.id}`,
      title: row.title,
      date: row.date!,
      context: row.subject,
      high: false,
      href: `/subjects/${row.subjectId}`,
    })),
    ...subjects.map((row) => ({
      id: `subject:${row.id}`,
      title: row.title,
      date: row.date!,
      context: null,
      high: false,
      href: `/subjects/${row.id}`,
    })),
  ]
    .sort(
      (a, b) => a.date.localeCompare(b.date) || Number(b.high) - Number(a.high),
    )
    .slice(0, 5);
  return { today, items };
}
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
export default async function UpcomingDeadlines({
  userId,
  timezone,
}: {
  userId: string;
  timezone: string;
}) {
  const t = await getTranslations("studyflow.dashboard");
  const result = await upcomingDeadlines(userId, timezone).catch(() => null);
  const format = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <DashboardPanel title={t("deadlinesTitle")}>
      {!result ? (
        <PanelEmpty message={t("unavailable")} />
      ) : result.items.length ? (
        <ul className="sf-panel-list">
          {result.items.map((item) => {
            const days = daysBetween(result.today, item.date);
            return (
              <li key={item.id}>
                <Link href={item.href} className="sf-deadline-row">
                  <span className="min-w-0">
                    <span className="sf-row-title">{item.title}</span>
                    <span className="sf-row-meta">
                      {[
                        item.context,
                        format.format(new Date(`${item.date}T00:00:00Z`)),
                        item.high ? t("highPriority") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span
                    className="sf-chip"
                    data-tone={days <= 2 ? "warning" : undefined}
                  >
                    {days === 0
                      ? t("dueToday")
                      : days === 1
                        ? t("dueTomorrow")
                        : t("inDays", { days })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <PanelEmpty message={t("noDeadlines")} />
      )}
    </DashboardPanel>
  );
}
