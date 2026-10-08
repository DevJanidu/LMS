"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { APP_NAME } from "@/lib/constants";
import EmptyState from "./EmptyState";
import { primaryLink } from "./styles";
interface Props {
  code: 404 | 500;
}
/** Friendly full-width error page with a route back into learning. */
export default function ErrorPage({ code }: Props) {
  const t = useTranslations("studyflow");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 p-6 text-primary dark:bg-gray-950 dark:text-primary">
      <p className="mb-6 text-h2 text-brand-600 dark:text-brand-300">
        {APP_NAME}
      </p>
      <p className="mb-5 text-h1 text-secondary dark:text-secondary">
        {code}
      </p>
      <EmptyState
        headingLevel={1}
        title={t(code === 404 ? "notFoundTitle" : "serverErrorTitle")}
        description={t(
          code === 404 ? "notFoundDescription" : "serverErrorDescription",
        )}
        action={
          <Link href="/dashboard" className={primaryLink}>
            {t("goHome")}
          </Link>
        }
      />
    </div>
  );
}
