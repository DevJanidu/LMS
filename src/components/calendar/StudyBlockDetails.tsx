"use client";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { primaryLink } from "@/components/studyflow/styles";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import type { BlockOccurrence } from "@/lib/schedule";
interface Props { data: Workspace; occurrence: BlockOccurrence; isOpen: boolean; onClose: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }
export default function StudyBlockDetails({data,occurrence,isOpen,onClose,onEdit,onDuplicate,onDelete}: Props) {
  const t = useTranslations("studyflow"); const locale = useLocale();
  const subject = data.subjects.find(s=>s.id===occurrence.block.subjectId);
  const topic = data.topics.find(s=>s.id===occurrence.block.topicId);
  return <Modal isOpen={isOpen} onClose={onClose} title={t("redesign.sessionDetails")} className="sf-event-sheet"><p className="sf-eyebrow mb-2">{subject?.title ?? t("calendar")}</p><h2>{occurrence.title}</h2>{topic && <p className="mt-2 text-muted">{topic.title}</p>}<p className="mt-6 text-body">{formatDate(occurrence.startsAt,data.user.timezone,locale,true)}</p><p className="mt-2 text-body text-muted">{duration((Date.parse(occurrence.endsAt)-Date.parse(occurrence.startsAt))/1000)} · {t(occurrence.block.repeat === "weekly" ? "weekly" : "oneTime")}</p>{occurrence.block.note && <p className="mt-4 text-body text-muted">{occurrence.block.note}</p>}<div className="mt-7 flex flex-wrap gap-3">{subject?.status === "active" && <Link href={`/study?subject=${subject.id}&topic=${topic?.id ?? ""}`} className={primaryLink}>{t("startStudying")}</Link>}<Button variant="outline" onClick={onEdit}>{t("editBlock")}</Button><Button variant="outline" onClick={onDuplicate}>{t("redesign.duplicate")}</Button><Button variant="outline" onClick={onDelete}>{t("delete")}</Button></div></Modal>;
}
