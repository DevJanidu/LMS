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
    <div className="flex min-h-dvh flex-col bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-200">
      <header className="p-6 sm:p-10">
        <Link
          href="/dashboard"
          className="text-xl font-semibold text-brand-600 dark:text-brand-300"
        >
          {APP_NAME}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-5 py-10">
        {children}
      </main>
      <footer className="p-6 text-center text-theme-xs text-gray-400 dark:text-gray-500">
        {APP_NAME} · {t("footer")}
      </footer>
    </div>
  );
}
