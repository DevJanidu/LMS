import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AdminOverview from "@/components/admin/AdminOverview";
export default async function Page({ params }: { params: Promise<{ locale: string;  }> }) { const { locale } = await params; setRequestLocale(locale); return <AdminOverview initial={getWorkspace()} />; }
