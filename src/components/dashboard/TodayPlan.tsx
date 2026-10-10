"use client";
import TextLink from "@/components/studyflow/TextLink";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Workspace } from "@/types";
import type { BlockOccurrence } from "@/lib/schedule";
import { duration } from "@/lib/time";
import { primaryLink } from "@/components/studyflow/styles";
import { ArrowRightIcon } from "@/icons";
interface Props { data: Workspace; today: string; blocks: BlockOccurrence[]; next?: BlockOccurrence }
export default function TodayPlan({data, today, blocks, next}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const featured = blocks[0];
  const time = (value: string) => new Intl.DateTimeFormat(locale, {hour:"numeric",minute:"2-digit",timeZone:data.user.timezone}).format(new Date(value));
  const href = featured?.block.subjectId ? `/study?subject=${featured.block.subjectId}&topic=${featured.block.topicId ?? ""}` : "/study";
  return <section className="sf-today"><div className="sf-today-heading"><div><p className="sf-eyebrow">{t("today")}</p><p className="mt-1 text-body text-muted">{new Intl.DateTimeFormat(locale, {weekday:"long",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(`${today}T12:00:00Z`))}</p></div><TextLink href="/calendar">{t("calendar")}</TextLink></div>
    <div className="sf-next"><div><p className="sf-eyebrow mb-2">{t(featured ? "nextStudyBlock" : "redesign.openSpace")}</p>{featured && <p className="sf-next-time mb-2">{time(featured.startsAt)}</p>}<h3>{featured?.title ?? t("redesign.makeProgress")}</h3><p className="mt-2 text-body text-muted">{featured ? `${data.subjects.find(s => s.id === featured.block.subjectId)?.title ?? ""} · ${duration((Date.parse(featured.endsAt) - Date.parse(featured.startsAt)) / 1000)}` : t("redesign.smallStep")}</p></div><Link href={href} className={primaryLink}>{t("startStudying")} <ArrowRightIcon aria-hidden="true" className="size-4 -rotate-45 rtl:-rotate-135" /></Link></div>
    {blocks.slice(1, 3).map(item => <Link key={`${item.block.id}-${item.date}`} href="/calendar" className="sf-agenda-item"><time>{time(item.startsAt)}</time><span className="text-body">{item.title}</span></Link>)}
    {!featured && <TextLink href="/calendar?add=1" className="sf-agenda-item">{next ? `${t("nextStudyBlock")}: ${next.title}` : t("scheduleStudy")}</TextLink>}
  </section>;
}
