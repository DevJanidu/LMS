"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { DateTimePickerField } from "@/components/form/DatePickerField";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { featureRequest } from "@/lib/goals/client";
import { wallTime, zonedToUtc } from "@/lib/analytics";
import { errorKey } from "./types";
export interface NotificationActionValue {
  kind?: string;
  blockId?: string;
  date?: string;
  subjectId?: string;
  topicId?: string;
  startsAt?: string;
  endsAt?: string;
  resolved?: string;
}
interface Props {
  id: string;
  action: NotificationActionValue | null | undefined;
  timezone: string;
  onAsk?: () => void;
  onChanged?: (resolved?: string) => void;
}
type Kind = "skip" | "reschedule" | "snooze";
export default function NotificationActions({
  id,
  action,
  timezone,
  onAsk,
  onChanged,
}: Props) {
  const t = useTranslations("aven"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [resolved, setResolved] = useState(action?.resolved),
    [skipping, setSkipping] = useState(false),
    [rescheduling, setRescheduling] = useState(false),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const act = async (kind: Kind) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await featureRequest("/api/aven/notifications", {
        id,
        kind,
        ...(kind === "reschedule"
          ? {
              startsAt: zonedToUtc(start, timezone),
              endsAt: zonedToUtc(end, timezone),
            }
          : {}),
      });
      if (kind === "snooze") setNotice(t("snoozedHour"));
      else setResolved(kind);
      setRescheduling(false);
      onChanged?.(kind === "snooze" ? undefined : kind);
      return true;
    } catch (failure) {
      setError(t(errorKey(t, (failure as Error).message)));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const session =
    action?.kind === "session" && action.blockId && action.startsAt;
  return (
    <div className="aven-reminder-actions">
      {resolved ? (
        <p className="aven-reminder-outcome">
          {t.has(`notificationResolved.${resolved}`)
            ? t(`notificationResolved.${resolved}`)
            : t("proposalStatuses.approved")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {session && (
            <>
              <Link
                href={`/study?block=${action.blockId}&date=${action.date ?? ""}&subject=${action.subjectId ?? ""}&topic=${action.topicId ?? ""}`}
                className="aven-chip aven-chip-primary"
              >
                {t("startNow")}
              </Link>
              <button
                type="button"
                className="aven-chip"
                disabled={busy}
                onClick={() => {
                  setStart(wallTime(action.startsAt!, timezone));
                  setEnd(wallTime(action.endsAt ?? action.startsAt!, timezone));
                  setRescheduling(true);
                }}
              >
                {t("reschedule")}
              </button>
            </>
          )}
          <button
            type="button"
            className="aven-chip"
            disabled={busy}
            onClick={() => {
              void act("snooze");
            }}
          >
            {t("snooze")}
          </button>
          {session && (
            <button
              type="button"
              className="aven-chip"
              disabled={busy}
              onClick={() => setSkipping(true)}
            >
              {t("skip")}
            </button>
          )}
          {onAsk && (
            <button type="button" className="aven-chip" onClick={onAsk}>
              {t("askAven")}
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="aven-reminder-outcome">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      <ConfirmDialog
        isOpen={skipping}
        onClose={() => setSkipping(false)}
        title={t("skip")}
        description={t("skipHelp")}
        onConfirm={async () => {
          const saved = await act("skip");
          if (saved) setSkipping(false);
          return saved;
        }}
      />
      {rescheduling && (
        <Modal
          isOpen
          onClose={() => setRescheduling(false)}
          title={t("reschedule")}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act("reschedule");
            }}
          >
            <DateTimePickerField
              label={t("startsAt")}
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
            />
            <DateTimePickerField
              label={t("endsAt")}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {t(busy ? "saving" : "save")}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
