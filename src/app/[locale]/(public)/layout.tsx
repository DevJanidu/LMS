import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { APP_NAME } from "@/lib/constants";
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("studyflow");
  return (
    <div className="sf-public flex min-h-dvh flex-col bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-200">
      <header className="p-6 sm:p-10">
        <Link
          href="/dashboard"
          className="text-xl font-semibold text-brand-600 dark:text-brand-300"
        >
          {APP_NAME}
        </Link>
      </header>
      <main className="sf-public-main mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-5 py-10 lg:grid-cols-2">
        <aside className="sf-public-story"><p className="sf-eyebrow">{t("redesign.philosophy")}</p><h1>{t("redesign.authHeadline")}</h1><p>{t("redesign.authStory")}</p><div className="sf-learning-path" aria-hidden="true"><span>01</span><i /><span>02</span><i /><span>03</span><i /><span>04</span></div></aside><div className="sf-public-form">{children}</div>
      </main>
      <footer className="p-6 text-center text-theme-xs text-gray-600 dark:text-gray-400">
        {APP_NAME} · {t("footer")}
      </footer>
    </div>
  );
}
