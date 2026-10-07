import { ThemeProvider } from "@/context/ThemeContext";
import { isRtl } from "@/i18n/languages";
import { type Locale, routing } from "@/i18n/routing";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Geist } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import "../workspace.css";
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    "Your personal study workspace. Organise subjects, plan your week and track your learning.",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html suppressHydrationWarning lang={locale} dir={isRtl(locale as Locale) ? "rtl" : "ltr"}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var m=document.cookie.match(/(?:^|; )sf-theme=(dark|light|auto)(?:;|$)/);var v=m?m[1]:'light';var d=v==='dark'||(v==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.setAttribute('data-color-scheme',d?'dark':'light')})()` }} />
      </head>
      <body className={`${geist.className} ${geist.variable} bg-gray-50 dark:bg-gray-900`}>
        <NextIntlClientProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
