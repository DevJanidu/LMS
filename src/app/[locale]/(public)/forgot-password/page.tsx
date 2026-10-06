import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import AuthForm from "@/components/auth/AuthForm";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; setRequestLocale(locale); return <AuthForm initial={getWorkspace()} mode="forgot-password"/>; }
