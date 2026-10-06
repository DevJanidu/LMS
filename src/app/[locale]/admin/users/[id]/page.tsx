import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AdminUserDetail from "@/components/admin/AdminUserDetail";
export default async function Page({ params }: { params: Promise<{ locale: string; id: string; }> }) { const { locale, id } = await params; setRequestLocale(locale); return <AdminUserDetail initial={getWorkspace()} id={id}/>; }
