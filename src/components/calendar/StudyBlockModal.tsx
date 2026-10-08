"use client";
import { useId, useState } from "react";
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
import { newId } from "@/lib/workspace/store";
import type { CalendarCommand } from "@/lib/validation/calendar";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { getOccurrences, type BlockOccurrence } from "@/lib/schedule";
import type { ScheduleBlock, SubjectColor, Workspace } from "@/types";
import StudySelectors from "@/components/study/StudySelectors";
import ScheduleDateTimeField from "./ScheduleDateTimeField";
import { Checkbox } from "@/components/ui/Checkbox";
import { blockSchema } from "@/lib/validation";

const addMinutes = (value: string, minutes: number) =>
  new Date(Date.parse(`${value}:00Z`) + minutes * 60_000).toISOString().slice(0, 16);

interface Props {
  data: Workspace;
  occurrence?: BlockOccurrence;
  date: string;
  startLocal?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (command: CalendarCommand) => Promise<boolean>;
}
/** Study/custom block editor with explicit recurring occurrence scope. */
export default function StudyBlockModal({
  data,
  occurrence,
  date,
  startLocal,
  isOpen,
  onClose,
  onSave,
}: Props) {
  const id = useId();
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
  const [repeat, setRepeat] = useState<"once" | "weekly" | "daily">(block?.repeat ?? "once");
  const [weekdays, setWeekdays] = useState(block?.weekdays ?? []);
  const [scope, setScope] = useState("one");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<ScheduleBlock>();
  const [submitting, setSubmitting] = useState(false);
  const apply = (value: ScheduleBlock | undefined, remove = false) => {
    if (submitting) return;
    setSubmitting(true);
    const target = { id: block?.id ?? "", date: occurrence?.date ?? date, scope: scope as "one" | "future" | "all", newSeriesId: newId() };
    const command: CalendarCommand = remove ? { kind: "delete", ...target }
      : block && value ? { kind: "edit", ...target, value }
      : { kind: "create", value: value! };
    void onSave(command);
    onClose();
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
            (repeat !== "once" && !weekdays.length)
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
            repeat: repeat === "once" ? "once" : "weekly",
            weekdays,
            timezone,
            note: String(fields.get("note")) || undefined,
            color: fields.get("color") as SubjectColor,
            exceptions: [],
            createdAt: block?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          if (!blockSchema.safeParse(value).success) { setError(t("invalidBlock")); return; }
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
        <p className="text-small text-muted dark:text-secondary">
          {t("customBlockHelp")}
        </p>
        <Field
          label={t("customTitle")}
          name="title"
          defaultValue={source?.title}
        />
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          <span className="me-1 text-caption text-muted dark:text-secondary">{t("duration")}</span>
          {[30, 60, 90, 120].map((minutes) => (
            <button
              key={minutes}
              type="button"
              disabled={!Number.isFinite(Date.parse(`${startValue}:00Z`))}
              aria-pressed={(Date.parse(`${endValue}:00Z`) - Date.parse(`${startValue}:00Z`)) / 60_000 === minutes}
              onClick={() => setEndValue(addMinutes(startValue, minutes))}
              className="rounded-full border border-gray-300 bg-white px-3 py-2 text-caption text-secondary transition-colors hover:border-brand-400 hover:text-brand-600 aria-pressed:border-brand-500 aria-pressed:bg-brand-50 aria-pressed:text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-secondary dark:hover:border-brand-400 dark:hover:text-brand-300 dark:aria-pressed:bg-brand-500/15 dark:aria-pressed:text-brand-300"
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
              { setRepeat(event.target.value as "once" | "weekly" | "daily"); if (event.target.value === "daily") setWeekdays([0, 1, 2, 3, 4, 5, 6]); }
            }
          >
            <option value="once">{t("oneTime")}</option>
            <option value="weekly">{t("weekly")}</option>
            <option value="daily">{t("daily")}</option>
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
        {repeat !== "once" && (
          <fieldset>
            <legend className="mb-2 text-body">{t("weekdays")}</legend>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                const checked = weekdays.includes(day);
                const labelId = `${id}-repeat-day-${day}`;
                const toggle = () => { if (repeat === "daily" && checked) setRepeat("weekly"); setWeekdays(current => checked
                  ? current.filter(item => item !== day)
                  : [...current, day]); };
                return (
                  <div key={day} className="inline-flex min-h-8 items-center gap-2 text-small">
                    <Checkbox
                      id={labelId}
                      checked={checked}
                      aria-labelledby={`${labelId}-label`}
                      className="!aspect-square !h-4 !min-h-0 !min-w-0 !w-4 shrink-0"
                      onCheckedChange={(next) => { if (repeat === "daily" && next !== true) setRepeat("weekly"); setWeekdays(current => next === true
                        ? current.includes(day) ? current : [...current, day]
                        : current.filter(item => item !== day)); }}
                    />
                    <button id={`${labelId}-label`} type="button" onClick={toggle} aria-pressed={checked} className="text-start">
                      {t(`weekdaysShort.d${day}`)}
                    </button>
                  </div>
                );
              })}
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
            <option value="all">{t("planner.allSeries")}</option>
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
            className="text-body text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={submitting}>{t("save")}</Button>
          {block && (
            <Button variant="outline" onClick={() => setDeleting(true)}>
              {t("delete")}
            </Button>
          )}
          {subject && (
            <Link
              href={`/study?subject=${subject}&topic=${topic}`}
              onClick={onClose}
              className="inline-flex items-center px-3 text-body text-brand-600 dark:text-brand-300"
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
