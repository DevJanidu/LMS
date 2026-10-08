"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { getSubjects } from "@/lib/workspace/queries";
import { newId, updateWorkspace } from "@/lib/workspace/store";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { getOccurrences, type BlockOccurrence } from "@/lib/schedule";
import type { ScheduleBlock, SubjectColor, Workspace } from "@/types";
import StudySelectors from "@/components/study/StudySelectors";
import ScheduleDateTimeField from "./ScheduleDateTimeField";

const addMinutes = (value: string, minutes: number) =>
  new Date(Date.parse(`${value}:00Z`) + minutes * 60_000).toISOString().slice(0, 16);

interface Props {
  data: Workspace;
  occurrence?: BlockOccurrence;
  date: string;
  startLocal?: string;
  isOpen: boolean;
  onClose: () => void;
}
/** Study/custom block editor with explicit recurring occurrence scope. */
export default function StudyBlockModal({
  data,
  occurrence,
  date,
  startLocal,
  isOpen,
  onClose,
}: Props) {
  const t = useTranslations("studyflow");
  const block = occurrence?.block.id ? occurrence.block : undefined;
  const source = occurrence?.block;
  const timezone = block?.timezone ?? data.user.timezone;
  const initialStart = occurrence
    ? wallTime(occurrence.startsAt, timezone)
    : startLocal ?? `${date}T17:00`;
  const initialEnd = occurrence
    ? wallTime(occurrence.endsAt, timezone)
    : startLocal ? addMinutes(startLocal, 60) : `${date}T18:00`;
  const [subject, setSubject] = useState(source?.subjectId ?? "");
  const [topic, setTopic] = useState(source?.topicId ?? "");
  const [startValue, setStartValue] = useState(initialStart);
  const [endValue, setEndValue] = useState(initialEnd);
  const [repeat, setRepeat] = useState(block?.repeat ?? "once");
  const [weekdays, setWeekdays] = useState(block?.weekdays ?? []);
  const [scope, setScope] = useState("one");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<ScheduleBlock>();
  const apply = async (value: ScheduleBlock | undefined, remove = false) => {
    const saved = await updateWorkspace(data, (state) => {
      if (!block)
        return value ? { ...state, blocks: [...state.blocks, value] } : state;
      const original = state.blocks.find((item) => item.id === block.id);
      if (!original) return state;
      if (original.repeat === "weekly" && occurrence) {
        if (scope === "one") {
          const exception = {
            date: occurrence.date,
            cancelled: remove,
            startsAt: value?.startsAt,
            endsAt: value?.endsAt,
            title: value?.title,
            subjectId: value?.subjectId,
            topicId: value?.topicId,
            note: value?.note,
            color: value?.color,
          };
          return {
            ...state,
            blocks: state.blocks.map((item) =>
              item.id === block.id
                ? {
                    ...item,
                    exceptions: [
                      ...item.exceptions.filter(
                        (entry) => entry.date !== occurrence.date,
                      ),
                      exception,
                    ],
                  }
                : item,
            ),
          };
        }
        const past = {
          ...original,
          recurrenceUntil: shiftDay(occurrence.date, -1),
          exceptions: original.exceptions.filter(
            (entry) => entry.date < occurrence.date,
          ),
        };
        return {
          ...state,
          blocks: [
            ...state.blocks.map((item) => (item.id === block.id ? past : item)),
            ...(remove || !value
              ? []
              : [
                  {
                    ...value,
                    id: newId(),
                    exceptions: original.exceptions.filter(
                      (entry) => entry.date > occurrence.date,
                    ),
                  },
                ]),
          ],
        };
      }
      return {
        ...state,
        blocks: remove
          ? state.blocks.filter((item) => item.id !== block.id)
          : state.blocks.map((item) =>
              item.id === block.id && value ? value : item,
            ),
      };
    });
    if (saved) onClose(); else setError(t("saveFailed"));
    return saved;
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(block ? "editBlock" : "scheduleStudy")}
      size="wide"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const title =
            String(fields.get("title")).trim() ||
            getSubjects(data).find((item) => item.id === subject)?.title ||
            "";
          const startsAt = zonedToUtc(String(fields.get("start")), timezone);
          const endsAt = zonedToUtc(String(fields.get("end")), timezone);
          if (
            !title ||
            Date.parse(endsAt) <= Date.parse(startsAt) ||
            (repeat === "weekly" && !weekdays.length)
          ) {
            setError(t("invalidBlock"));
            return;
          }
          const timestamp = new Date().toISOString();
          const value: ScheduleBlock = {
            id: block?.id ?? newId(),
            userId: data.user.id,
            subjectId: subject || undefined,
            topicId: topic || undefined,
            title,
            startsAt,
            endsAt,
            repeat,
            weekdays,
            timezone,
            note: String(fields.get("note")) || undefined,
            color: fields.get("color") as SubjectColor,
            exceptions: [],
            createdAt: block?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          const day = localDay(startsAt, timezone);
          const candidates = getOccurrences([value], day, shiftDay(day, 35));
          const conflicts = getOccurrences(
            data.blocks.filter((item) => item.id !== block?.id),
            shiftDay(day, -1),
            shiftDay(day, 35),
          ).some((item) =>
            candidates.some(
              (candidate) =>
                Date.parse(item.startsAt) < Date.parse(candidate.endsAt) &&
                Date.parse(item.endsAt) > Date.parse(candidate.startsAt),
            ),
          );
          if (conflicts) {
            setPending(value);
            return;
          }
          apply(value);
        }}
      >
        <StudySelectors
          subjectRequired={false}
          data={data}
          subjectId={subject}
          topicId={topic}
          onSubjectChange={setSubject}
          onTopicChange={setTopic}
        />
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">
          {t("customBlockHelp")}
        </p>
        <Field
          label={t("customTitle")}
          name="title"
          defaultValue={source?.title}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ScheduleDateTimeField
            name="start"
            label={t("startLocal", { timezone })}
            dateLabel={t("date")}
            timeLabel={t("time")}
            value={startValue}
            onChange={(next) => {
              setStartValue(next);
              if (Date.parse(`${endValue}:00Z`) <= Date.parse(`${next}:00Z`)) {
                setEndValue(addMinutes(next, 60));
              }
            }}
          />
          <ScheduleDateTimeField
            name="end"
            label={t("endLocal", { timezone })}
            dateLabel={t("date")}
            timeLabel={t("time")}
            value={endValue}
            onChange={setEndValue}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-1 text-xs font-medium text-gray-500 dark:text-gray-400">{t("duration")}</span>
          {[30, 60, 90, 120].map((minutes) => (
            <button
              key={minutes}
              type="button"
              disabled={!Number.isFinite(Date.parse(`${startValue}:00Z`))}
              aria-pressed={(Date.parse(`${endValue}:00Z`) - Date.parse(`${startValue}:00Z`)) / 60_000 === minutes}
              onClick={() => setEndValue(addMinutes(startValue, minutes))}
              className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-brand-400 hover:text-brand-600 aria-pressed:border-brand-500 aria-pressed:bg-brand-50 aria-pressed:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-400 dark:hover:text-brand-300 dark:aria-pressed:bg-brand-500/15 dark:aria-pressed:text-brand-300"
            >
              {t("redesign.minutesValue", { count: minutes })}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("repeat")}
            value={repeat}
            onChange={(event) =>
              setRepeat(event.target.value as "once" | "weekly")
            }
          >
            <option value="once">{t("oneTime")}</option>
            <option value="weekly">{t("weekly")}</option>
          </SelectField>
          <SelectField
            label={t("color")}
            name="color"
            defaultValue={block?.color ?? "brand"}
          >
            {["brand", "success", "orange", "purple"].map((color) => (
              <option key={color} value={color}>
                {t(`colors.${color}`)}
              </option>
            ))}
          </SelectField>
        </div>
        {repeat === "weekly" && (
          <fieldset>
            <legend className="mb-2 text-sm">{t("weekdays")}</legend>
            <div className="flex flex-wrap gap-3">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <label
                  key={day}
                  className="flex items-center gap-1 text-theme-xs"
                >
                  <input
                    type="checkbox"
                    checked={weekdays.includes(day)}
                    onChange={(event) =>
                      setWeekdays(
                        event.target.checked
                          ? [...weekdays, day]
                          : weekdays.filter((item) => item !== day),
                      )
                    }
                  />
                  {t(`weekdaysShort.d${day}`)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {block?.repeat === "weekly" && (
          <SelectField
            label={t("repeatScope")}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="one">{t("thisOne")}</option>
            <option value="future">{t("allFuture")}</option>
          </SelectField>
        )}
        <TextField
          label={t("noteOptional")}
          name="note"
          defaultValue={block?.note}
        />
        {error && (
          <p
            role="alert"
            className="text-sm text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{t("save")}</Button>
          {block && (
            <Button variant="outline" onClick={() => setDeleting(true)}>
              {t("delete")}
            </Button>
          )}
          {subject && (
            <Link
              href={`/study?subject=${subject}&topic=${topic}`}
              onClick={onClose}
              className="inline-flex items-center px-3 text-sm text-brand-600 dark:text-brand-300"
            >
              {t("startTimer")}
            </Link>
          )}
        </div>
      </form>
      <ConfirmDialog
        isOpen={deleting || Boolean(pending)}
        onClose={() => {
          setDeleting(false);
          setPending(undefined);
        }}
        title={t(deleting ? "deleteBlock" : "overlapTitle")}
        description={t(deleting ? "deleteBlockWarning" : "overlapWarning")}
        onConfirm={() => apply(pending, deleting)}
      />
    </Modal>
  );
}
