"use client";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
import EmptyState from "./EmptyState";
interface Props {
  reset: () => void;
}
/** Recoverable error without exposing technical details. */
export default function ErrorState({ reset }: Props) {
  const t = useTranslations("studyflow");
  return (
    <EmptyState
      title={t("errorTitle")}
      description={t("errorDescription")}
      action={<Button onClick={reset}>{t("tryAgain")}</Button>}
    />
  );
}
