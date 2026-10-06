import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AdminUsers from "@/components/admin/AdminUsers";
export default async function Page({ params }: { params: Promise<{ locale: string;  }> }) { const { locale } = await params; setRequestLocale(locale); return <AdminUsers initial={getWorkspace()} />; }
