import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";

export interface RevisitItem { id: string; title: string; completed: number; total: number; lastStudiedAt?: string }
interface Props { items: RevisitItem[]; hasSubjects: boolean; /** Shared page clock, so relative dates match on server and client. */ now: number }

/** Active subjects with unfinished topics, least recently studied first. */
export default function RevisitSubjects({ items, hasSubjects, now }: Props) {
  const t = useTranslations("analytics");
  const format = useFormatter();
  if (!items.length) {
    return (
      <p className="an-empty-inline">
        {hasSubjects ? t("allCaughtUp") : t("noSubjects")}{" "}
        {!hasSubjects && <Link href="/subjects" className="an-link">{t("addSubject")}</Link>}
      </p>
    );
  }
  return (
    <ul className="an-revisit">
      {items.map(item => {
        const percent = item.total ? Math.round((item.completed / item.total) * 100) : 0;
        return (
          <li key={item.id}>
            <Link href={`/subjects/${item.id}`} className="an-revisit-row">
              <span className="min-w-0 flex-1">
                <span className="an-revisit-title">{item.title}</span>
                <span className="an-muted">
                  {item.lastStudiedAt ? t("lastStudied", { date: format.relativeTime(new Date(item.lastStudiedAt), new Date(now)) }) : t("neverStudied")}
                  {" · "}{t("topicsLeftCount", { count: item.total - item.completed })}
                </span>
              </span>
              <span className="an-revisit-progress" aria-label={t("subjectProgress", { percent })}>
                <span className="an-mini-track"><span style={{ inlineSize: `${percent}%` }} /></span>
                <span className="tabular-nums">{percent}%</span>
              </span>
              <ArrowRightIcon className="an-revisit-arrow rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
