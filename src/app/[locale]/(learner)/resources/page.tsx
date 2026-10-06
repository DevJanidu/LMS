import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import Resources from "@/components/resources/Resources";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ add?: string; search?: string }> }) { const { locale } = await params; setRequestLocale(locale); const { add, search } = await searchParams; return <Resources initial={getWorkspace()} add={add === "1"} search={search}/>; }
