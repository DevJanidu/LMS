"use client";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";
interface Props {
  pageTitle: string;
}
/** A compact, localized trail within learner and admin workspaces. */
export default function PageBreadCrumb({ pageTitle }: Props) {
  const path = usePathname();
  const t = useTranslations("studyflow");
  const admin = path.startsWith("/admin");
  if (
    [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/terms",
      "/privacy",
    ].includes(path) ||
    path.startsWith("/onboarding")
  )
    return null;
  return (
    <nav aria-label={t("breadcrumb")} className="mb-3">
      <ol className="flex flex-wrap items-center gap-2 text-small text-muted dark:text-muted">
        <li>
          <Link href={admin ? "/admin" : "/dashboard"}>
            {t(admin ? "admin" : "dashboard")}
          </Link>
        </li>
        <li aria-hidden="true">
          <ArrowRightIcon className="size-3 rtl:rotate-180" />
        </li>
        <li aria-current="page">{pageTitle}</li>
      </ol>
    </nav>
  );
}
