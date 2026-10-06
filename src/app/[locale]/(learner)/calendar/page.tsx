import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import StudyCalendar from "@/components/calendar/StudyCalendar";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ add?: string }> }) { const { locale } = await params; setRequestLocale(locale); const { add } = await searchParams; return <StudyCalendar initial={getWorkspace()} add={add === "1"}/>; }
