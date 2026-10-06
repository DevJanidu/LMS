import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import Analytics from "@/components/analytics/Analytics";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; setRequestLocale(locale); return <Analytics initial={getWorkspace()}/>; }
