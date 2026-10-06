import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import StudyHistory from "@/components/study/StudyHistory";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; setRequestLocale(locale); return <StudyHistory initial={getWorkspace()}/>; }
