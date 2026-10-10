"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { subscribeWriteFailures, useWriteStatus } from "@/lib/workspace/write-status";
import { retryWorkspaceMutation, useWorkspaceRetryable } from "@/lib/workspace/store";

interface Props {
  owner: string;
}

export default function SaveFeedback({ owner }: Props) {
  const t = useTranslations("studyflow");
  const status = useWriteStatus(owner);
  const retryable = useWorkspaceRetryable();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeWriteFailures(owner, () => {
      setVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setVisible(false), 5000);
    });
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [owner]);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {status === "saving" ? t("savingChanges") : status === "saved" ? t("changesSaved") : ""}
      </p>
      {visible && (
        <div role="alert" className="fixed bottom-24 end-4 z-999999 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-body text-gray-700 shadow-theme-md sm:bottom-6 sm:end-6 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
          <span>{t("saveToast")}</span>
          {retryable && <button type="button" className="underline" onClick={() => { setVisible(false); void retryWorkspaceMutation(); }}>{t("planner.retry")}</button>}
        </div>
      )}
    </>
  );
}
