import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import Settings from "@/components/settings/Settings";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; setRequestLocale(locale); return <Settings initial={getWorkspace()}/>; }
