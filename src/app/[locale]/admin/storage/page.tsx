import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AdminStorage from "@/components/admin/AdminStorage";
export default async function Page({ params }: { params: Promise<{ locale: string;  }> }) { const { locale } = await params; setRequestLocale(locale); return <AdminStorage initial={getWorkspace()} />; }
