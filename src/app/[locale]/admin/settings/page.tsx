import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AdminSettings from "@/components/admin/AdminSettings";
export default async function Page({ params }: { params: Promise<{ locale: string;  }> }) { const { locale } = await params; setRequestLocale(locale); return <AdminSettings initial={getWorkspace()} />; }
