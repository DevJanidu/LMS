import "server-only";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/constants";

export async function sendAccountEmail(to: string, kind: "reset" | "verify", url: string) {
  const env = getEnv();
  const t = await getTranslations("studyflow");
  const subject = t(kind === "reset" ? "accountEmails.resetSubject" : "accountEmails.verifySubject", { appName: APP_NAME });
  const result = await new Resend(env.RESEND_API_KEY).emails.send({ from: env.EMAIL_FROM, to, subject, text: `${subject}\n\n${t("accountEmails.instructions")}\n${url}\n\n${t("accountEmails.ignore")}` });
  if (result.error) throw new Error("Account email delivery failed.");
}
