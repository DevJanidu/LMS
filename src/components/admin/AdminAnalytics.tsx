"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useNow, useWorkspace } from "@/lib/workspace/store";
import { adminMetrics } from "@/lib/analytics/admin";
import { dailySeconds, localDay, shiftDay, totalSeconds } from "@/lib/analytics";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import PageHeader from "@/components/studyflow/PageHeader";
import StatTile from "@/components/studyflow/StatTile";
import ComponentCard from "@/components/common/ComponentCard";
import StudyChart from "@/components/analytics/StudyChart";
import { SelectField } from "@/components/studyflow/FormFields";
export default function AdminAnalytics({initial}: {initial:Workspace}) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const clock = useNow();
  const metrics = adminMetrics(data,clock || Date.parse(initial.user.lastActiveAt));
  const [range,setRange] = useState(30);
  const days = Array.from({length:range},(_,i)=>shiftDay(metrics.today,i-range+1));
  const valid = data.sessions.filter(s=>s.status==="valid" && s.durationSeconds>=60);
  const sessions = valid.filter(s=>{const day=localDay(s.startedAt,data.user.timezone);return day>=days[0] && day<=metrics.today;});
  const previous = new Set(valid.filter(s=>localDay(s.startedAt,data.user.timezone)<days[0]).map(s=>s.userId));
  const active = new Set(sessions.map(s=>s.userId));
  const returning = [...active].filter(id=>previous.has(id)).length;
  const totals = data.platform?.secondsByDay ?? dailySeconds(valid,data.user.timezone);
  const labels = days.map(d=>formatDate(d,data.user.timezone,locale));
  return <>
    <PageHeader title={t("platformAnalytics")} description={t("redesign.activeDefinition")} action={<SelectField label={t("period")} value={range} onChange={e=>setRange(Number(e.target.value))}>{[7,30,90].map(n=><option key={n} value={n}>{t("redesign.daysRange",{count:n})}</option>)}</SelectField>} />
    <div className="sf-metric-strip mb-7 grid sm:grid-cols-2 xl:grid-cols-4"><StatTile label={t("activeUsers")} value={active.size}/><StatTile label={t("sessions")} value={sessions.length}/><StatTile label={t("studyTime")} value={duration(totalSeconds(sessions))}/><StatTile label={t("redesign.returning")} value={returning} detail={t("redesign.returningHelp")}/></div>
    <div className="grid gap-6 xl:grid-cols-2"><ComponentCard title={t("redesign.growth")}><StudyChart type="line" labels={labels} values={days.map(day=>data.platform?.growth[day] ?? data.users.filter(u=>localDay(u.createdAt,data.user.timezone)<=day).length)} label={t("totalUsers")}/></ComponentCard><ComponentCard title={t("redesign.engagement")}><StudyChart labels={labels} values={days.map(metrics.dailyActive)} label={t("dailyActive")}/></ComponentCard><ComponentCard title={t("sessionsPerDay")}><StudyChart labels={labels} values={days.map(day=>data.platform?.sessionsByDay[day] ?? sessions.filter(s=>localDay(s.startedAt,data.user.timezone)===day).length)} label={t("sessions")}/></ComponentCard><ComponentCard title={t("redesign.activity")}><StudyChart type="line" labels={labels} values={days.map(day=>Math.round((totals[day]??0)/60))} label={t("minutes")}/></ComponentCard></div>
    <div className="sf-metric-strip mt-7 grid sm:grid-cols-3"><StatTile label={t("subjectsCreated")} value={data.subjects.filter(s=>localDay(s.createdAt,data.user.timezone)>=days[0] && localDay(s.createdAt,data.user.timezone)<=metrics.today).length}/><StatTile label={t("topicsCompleted")} value={data.topics.filter(topic=>topic.completedAt && localDay(topic.completedAt,data.user.timezone)>=days[0] && localDay(topic.completedAt,data.user.timezone)<=metrics.today).length}/><StatTile label={t("averageSession")} value={t("redesign.minutesValue",{count:sessions.length?Math.round(totalSeconds(sessions)/sessions.length/60):0})}/></div>
  </>;
}
