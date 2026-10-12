"use client";
import { useTranslations } from "next-intl";
import { CommandIcon } from "@/icons";
export default function AvenActivity({ name }: { name: string }) {
  const t = useTranslations("aven");
  return (
    <p
      role="status"
      className="text-muted dark:text-muted flex items-center gap-2 py-2 text-small"
    >
      <CommandIcon className="size-4 animate-pulse text-brand-500 dark:text-brand-300" />
      {t.has(`activity.${name}`)
        ? t(`activity.${name}`)
        : t("activity.working")}
    </p>
  );
}
