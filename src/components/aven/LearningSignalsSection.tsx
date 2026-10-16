"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
import { featureRequest } from "@/lib/goals/client";
import type { LearningSignal } from "@/lib/learning/signals";
import AvenSettingsSection from "./AvenSettingsSection";
type Report = LearningSignal & { subjectTitle: string; topicTitle: string | null };
/** The learner's own difficulty and confidence reports, removable at any time. */
export default function LearningSignalsSection() {
  const t = useTranslations("aven.learning"),
    common = useTranslations("aven"),
    [reports, setReports] = useState<Report[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    featureRequest<{ signals: Report[] }>("/api/learning/signals")
      .then((value) => setReports(value.signals))
      .catch(() => setReports([]));
  useEffect(() => {
    void load();
  }, []);
  const remove = async (report: Report) => {
    setBusy(true);
    setError("");
    try {
      await featureRequest("/api/learning/signals", {
        kind: "remove",
        subjectId: report.subjectId,
        topicId: report.topicId,
      });
      await load();
    } catch {
      setError(common("errors.serviceUnavailable"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AvenSettingsSection title={t("signalsTitle")} description={t("signalsHelp")}>
      {reports && !reports.length && (
        <p className="text-secondary dark:text-secondary text-small">
          {t("signalsEmpty")}
        </p>
      )}
      {reports?.map((report) => (
        <div
          key={`${report.subjectId}:${report.topicId ?? ""}`}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          <div>
            <p className="text-primary dark:text-primary text-small font-medium">
              {report.topicTitle
                ? t("signalTopic", {
                    subject: report.subjectTitle,
                    topic: report.topicTitle,
                  })
                : report.subjectTitle}
              {" · "}
              {t(`levels.${report.level}`)}
            </p>
            <p className="text-secondary dark:text-secondary text-small">
              {t("reportedOn", { date: report.at.slice(0, 10) })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void remove(report)}
          >
            {t("removeSignal")}
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-small text-error-600 dark:text-error-400">
          {error}
        </p>
      )}
    </AvenSettingsSection>
  );
}
