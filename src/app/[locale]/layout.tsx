import { ThemeProvider } from "@/context/ThemeContext";
import { type Locale, routing } from "@/i18n/routing";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import "../workspace.css";
import "../sidebar.css";
import "../settings.css";
import "../billing.css";
import "../analytics.css";
import "../circles.css";
import "../dashboard.css";
import "../goals.css";
import "../aven.css";
import "../aven-blocks.css";
import "../aven-models.css";
import "../marketing.css";
import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import ServerActionRecovery from "@/components/common/ServerActionRecovery";
import { THEME_SCRIPT } from "@/lib/security/csp";
export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    "Your personal study workspace. Organise subjects, plan your week and track your learning.",
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
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
    <html
      // Smooth for in-page anchors and scrollIntoView; Next.js jumps instantly on route changes.
      data-scroll-behavior="smooth"
      className={`${inter.variable} font-sans`}
      suppressHydrationWarning
      lang="en"
      dir="ltr"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_SCRIPT,
          }}
        />
      </head>
      <body className={"bg-gray-50 dark:bg-gray-900"}>
        <NextIntlClientProvider>
          <ThemeProvider>
            {children}
            <ServerActionRecovery />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
