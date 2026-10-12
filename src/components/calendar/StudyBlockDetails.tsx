"use client";
import { useLocale, useTranslations } from "next-intl";
import AttendSessionButton from "@/components/study/AttendSessionButton";
import useAttendance from "@/hooks/useAttendance";
import { attendanceFor, attendanceStatus } from "@/lib/study/attendance-model";
import { useNow } from "@/lib/workspace/store";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import type { BlockOccurrence } from "@/lib/schedule";
interface Props {
  data: Workspace;
  occurrence: BlockOccurrence;
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}
export default function StudyBlockDetails({
  data,
  occurrence,
  isOpen,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const attendance = useAttendance(data.user.updatedAt);
  const now =
    useNow(60000) || Date.parse(data.loadedAt ?? data.user.lastActiveAt);
  const subject = data.subjects.find(
    (s) => s.id === occurrence.block.subjectId,
  );
  const topic = data.topics.find((s) => s.id === occurrence.block.topicId);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("redesign.sessionDetails")}
      className="sf-event-sheet"
    >
      <p className="sf-eyebrow mb-2">{subject?.title ?? t("calendar")}</p>
      <h2>{occurrence.title}</h2>
      {topic && <p className="text-muted mt-2">{topic.title}</p>}
      <p className="mt-6 text-body">
        {formatDate(occurrence.startsAt, data.user.timezone, locale, true)}
      </p>
      <p className="text-muted mt-2 text-body">
        {duration(
          (Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)) /
            1000,
        )}{" "}
        · {t(occurrence.block.repeat === "weekly" ? "weekly" : "oneTime")}
      </p>
      {occurrence.block.note && (
        <p className="text-muted mt-4 text-body">{occurrence.block.note}</p>
      )}
      <p className="text-muted dark:text-muted mt-4 text-small">
        {attendance.loading
          ? t("loading")
          : attendance.error
            ? t(attendance.error)
            : t(
                `attendanceStatus.${attendanceStatus(occurrence, attendance.records, now)}`,
              )}
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <AttendSessionButton
          data={data}
          occurrence={occurrence}
          status={attendanceFor(occurrence, attendance.records)?.status}
          loading={attendance.loading || Boolean(attendance.error)}
        />
        <Button variant="outline" onClick={onEdit}>
          {t("editBlock")}
        </Button>
        <Button variant="outline" onClick={onDuplicate}>
          {t("redesign.duplicate")}
        </Button>
        <Button variant="outline" onClick={onDelete}>
          {t("delete")}
        </Button>
      </div>
    </Modal>
  );
}
