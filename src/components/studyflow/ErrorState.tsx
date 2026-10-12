"use client";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
import EmptyState from "./EmptyState";
import { isUnrecognizedServerAction } from "@/lib/client/server-actions";
interface Props {
  reset: () => void;
  error?: Error & { digest?: string };
}
/** Recoverable error without exposing technical details. */
export default function ErrorState({ reset, error }: Props) {
  const t = useTranslations("studyflow");
  const outdated = isUnrecognizedServerAction(error);
  return (
    <EmptyState
      title={t(outdated ? "appUpdatedTitle" : "errorTitle")}
      description={t(outdated ? "appUpdatedDescription" : "errorDescription")}
      action={
        <Button onClick={outdated ? () => window.location.reload() : reset}>
          {t(outdated ? "refreshPage" : "tryAgain")}
        </Button>
      }
    />
  );
}
