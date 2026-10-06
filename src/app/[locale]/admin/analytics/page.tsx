import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
export default async function Page({ params }: { params: Promise<{ locale: string;  }> }) { const { locale } = await params; setRequestLocale(locale); return <AdminAnalytics initial={getWorkspace()} />; }
