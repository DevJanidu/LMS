import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CheckIcon } from "@/icons";

interface Subject {
  name: string;
  progress: number;
  topics: string;
  next: string;
}
interface Deadline {
  title: string;
  due: string;
}

const WEEK = [
  { day: "M", done: true },
  { day: "T", done: true },
  { day: "W", done: true },
  { day: "T", today: true },
  { day: "F" },
  { day: "S" },
  { day: "S" },
];

/** Home dashboard: greeting, today's focus, weekly rhythm and subjects. */
export default function DashboardPreview({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("marketing.preview.dashboard");
  const subjects = t.raw("subjects") as Subject[];
  const deadlines = t.raw("deadlines") as Deadline[];
  return (
    <div className="grid gap-4">
      <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"}`}>
        <div className="mk-greeting">
          <Image src="/images/morning.webp" alt="" fill sizes="(min-width: 1024px) 420px, 90vw" />
          <p className="mk-overline mk-overline-light">{t("eyebrow")}</p>
          <p className="mk-greeting-title mt-2">{t("greeting")}</p>
          <p className="mt-3 opacity-90">{t("encouragement")}</p>
          <span className="mt-3 inline-flex rounded-md bg-gray-950/70 px-2 py-0.5 text-caption">{t("badge")}</span>
        </div>
        <div className="mk-card mk-card-pad grid grid-cols-2 gap-4">
          <div>
            <p className="mk-secondary">{t("todayLabel")}</p>
            <p className="mk-stat mt-1">{t("todayValue")}</p>
            <p className="mt-1 mk-muted">{t("todayHint")}</p>
          </div>
          <div>
            <p className="mk-overline">{t("thisWeek")}</p>
            <div className="mk-week mt-2">
              {WEEK.map((item, index) => (
                <div key={index} className="grid gap-1">
                  <span className="mk-tiny mk-muted">{item.day}</span>
                  <span className="mk-week-day" data-done={Boolean(item.done)} data-today={Boolean(item.today)}>
                    {item.done ? <CheckIcon /> : 14 + index}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mk-stat">{t("streakValue")}</p>
            <p className="mk-muted">{t("streakLabel")}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <p className="mk-stat">{t("weekValue")}</p>
              <span className="mk-muted">62%</span>
            </div>
            <div className="mk-bar mt-2"><i style={{ width: "62%" }} /></div>
            <p className="mt-1 mk-muted">{t("weekTarget")}</p>
          </div>
        </div>
      </div>
      <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_14rem]"}`}>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-body-strong">{t("continueTitle")}</p>
            <span className="flex items-center gap-1 text-brand-500 dark:text-brand-300">{t("allSubjects")} <ArrowRightIcon className="size-3" /></span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {subjects.slice(0, 2).map((subject) => (
              <div key={subject.name} className="mk-card mk-card-pad">
                <p className="flex items-center gap-2 font-medium"><span className="mk-dot" />{subject.name}</p>
                <p className="mt-2 flex items-baseline gap-2"><span className="mk-stat">{subject.progress}%</span><span className="mk-muted">{subject.topics}</span></p>
                <div className="mk-bar mt-2"><i style={{ width: `${subject.progress}%` }} /></div>
                <div className="mt-3 rounded-lg mk-bg-subtle px-3 py-2">
                  <p className="mk-muted">{t("upNext")}</p>
                  <p className="font-medium">{subject.next}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {!compact && (
          <div className="hidden lg:block">
            <p className="mb-2 text-body-strong">{t("deadlinesTitle")}</p>
            <div className="mk-card divide-y">
              {deadlines.map((deadline) => (
                <div key={deadline.title} className="px-3 py-2.5">
                  <p className="font-medium">{deadline.title}</p>
                  <p className="mk-muted">{deadline.due}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
