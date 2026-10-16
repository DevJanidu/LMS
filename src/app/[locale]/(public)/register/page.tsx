import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
/** Google sign-in creates accounts, so the old sign-up URL goes to the same card. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: "/login", locale });
}
