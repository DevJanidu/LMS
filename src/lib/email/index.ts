import "server-only";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/constants";

export async function sendAccountEmail(to: string, kind: "reset" | "verify", url: string) {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("Account email is not configured.");
  const t = await getTranslations("studyflow");
  const subject = t(kind === "reset" ? "accountEmails.resetSubject" : "accountEmails.verifySubject", { appName: APP_NAME });
  const result = await new Resend(env.RESEND_API_KEY).emails.send({ from: env.EMAIL_FROM, to, subject, text: `${subject}\n\n${t("accountEmails.instructions")}\n${url}\n\n${t("accountEmails.ignore")}` });
  if (result.error || !result.data?.id) throw new Error("Account email delivery failed.");
}

export interface WelcomeRecipient {
  id: string;
  name: string;
  email: string;
}

export async function sendWelcomeEmail(user: WelcomeRecipient, locale: string) {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("Account email is not configured.");
  const t = await getTranslations({ locale, namespace: "studyflow.accountEmails" });
  const result = await new Resend(env.RESEND_API_KEY).emails.send({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: t("welcomeSubject", { appName: APP_NAME }),
    text: [
      t("welcomeGreeting", { name: user.name }),
      t("welcomeThanks", { appName: APP_NAME }),
      t("welcomeGettingStarted"),
      new URL("/onboarding", env.APP_URL).href,
      t("welcomeSignoff", { appName: APP_NAME }),
    ].join("\n\n"),
  }, { idempotencyKey: `welcome-user/${user.id}` });
  if (result.error || !result.data?.id) throw new Error("Welcome email delivery failed.");
}
