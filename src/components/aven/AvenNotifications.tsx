"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { featureRequest } from "@/lib/goals/client";
import type { listAvenNotifications } from "@/lib/aven/notifications";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { DateTimePickerField } from "@/components/form/DatePickerField";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Pagination from "@/components/studyflow/Pagination";
import { wallTime, zonedToUtc } from "@/lib/analytics";
type NotificationList = Awaited<ReturnType<typeof listAvenNotifications>>;
export default function AvenNotifications({ timezone }: { timezone: string }) {
  const t = useTranslations("aven"),
    [list, setList] = useState<NotificationList>({
      rows: [],
      total: 0,
      page: 1,
    }),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [skipping, setSkipping] = useState<string>(),
    [rescheduling, setRescheduling] = useState<string>(),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void featureRequest<NotificationList>(
      `/api/aven/notifications?page=${page}`,
      undefined,
      controller.signal,
    )
      .then(setList)
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            t.has(`errors.${error.message}`)
              ? t(`errors.${error.message}`)
              : t("errors.serviceUnavailable"),
          );
      });
    return () => controller.abort();
  }, [page, revision, t]);
  const act = async (id: string, kind: "read" | "skip" | "reschedule") => {
    if (busy) return;
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
      setRevision((value) => value + 1);
      setRescheduling(undefined);
      return true;
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`)
          ? t(`errors.${key}`)
          : t("errors.serviceUnavailable"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      {list.rows.map((item) => (
        <article
          key={item.id}
          className={`rounded-2xl border bg-white p-5 dark:bg-gray-dark ${item.readAt ? "border-gray-200 dark:border-gray-700" : "border-brand-300 dark:border-brand-700"}`}
        >
          <h3 className="text-primary dark:text-primary text-h3">
            {item.title}
          </h3>
          <p className="text-secondary dark:text-secondary mt-2 text-body whitespace-pre-wrap">
            {item.body}
          </p>
          <p className="text-muted dark:text-muted mt-3 text-caption">
            {new Date(item.createdAt).toLocaleString(undefined, {
              timeZone: timezone,
            })}{" "}
            ·{" "}
            {item.deliveries
              .map(
                (d) =>
                  `${t(`channels.${d.channel}`)}: ${t(`deliveryStatuses.${d.status}`)}`,
              )
              .join(" · ")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!item.readAt && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void act(item.id, "read");
                }}
              >
                {t("markRead")}
              </Button>
            )}
            {item.action?.kind === "session" && !item.action.resolved && (
              <>
                {item.action.subjectId && (
                  <Link
                    href={`/study?subject=${item.action.subjectId}&topic=${item.action.topicId ?? ""}`}
                    className="inline-flex items-center rounded-xl bg-brand-500 px-4 py-2 text-small text-white dark:bg-brand-500 dark:text-white"
                  >
                    {t("startNow")}
                  </Link>
                )}
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setRescheduling(item.id);
                    setStart(wallTime(item.action!.startsAt!, timezone));
                    setEnd(wallTime(item.action!.endsAt!, timezone));
                  }}
                >
                  {t("reschedule")}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setSkipping(item.id);
                  }}
                >
                  {t("skip")}
                </Button>
              </>
            )}
            {item.action?.goalId && (
              <Link
                href={`/goals/${item.action.goalId}`}
                className="inline-flex items-center text-small text-brand-600 dark:text-brand-300"
              >
                {t("openGoal")}
              </Link>
            )}
            {item.action?.resolved && (
              <span className="text-muted dark:text-muted text-small">
                {t(`notificationResolved.${item.action.resolved}`)}
              </span>
            )}
          </div>
        </article>
      ))}
      {!list.rows.length && (
        <p className="text-secondary dark:text-secondary py-10 text-center text-small">
          {t("noNotifications")}
        </p>
      )}
      <Pagination
        page={list.page}
        pages={Math.max(1, Math.ceil(list.total / 20))}
        onChange={setPage}
      />
      <ConfirmDialog
        isOpen={Boolean(skipping)}
        onClose={() => setSkipping(undefined)}
        title={t("skip")}
        description={t("skipHelp")}
        onConfirm={async () => {
          if (!skipping) return false;
          const saved = await act(skipping, "skip");
          if (saved) setSkipping(undefined);
          return Boolean(saved);
        }}
      />
      {rescheduling && (
        <Modal
          isOpen
          onClose={() => setRescheduling(undefined)}
          title={t("reschedule")}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act(rescheduling, "reschedule");
            }}
          >
            <DateTimePickerField
              label={t("startsAt")}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
            <DateTimePickerField
              label={t("endsAt")}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {t("save")}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
