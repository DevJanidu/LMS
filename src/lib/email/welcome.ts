import "server-only";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { getEnv } from "@/lib/env";
import { sendWelcomeEmail, type WelcomeRecipient } from "@/lib/email";

/** Called only after a new user is persisted; email failures never undo signup. */
export async function scheduleWelcomeEmail(user: WelcomeRecipient) {
  try {
    const env = getEnv();
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
      console.warn(JSON.stringify({ event: "welcome_email_unconfigured" }));
      return;
    }
    // Capture the language before leaving the registration request.
    const locale = await getLocale();
    after(async () => {
      try { await sendWelcomeEmail(user, locale); }
      catch { console.warn(JSON.stringify({ event: "welcome_email_failed" })); }
    });
  } catch { console.warn(JSON.stringify({ event: "welcome_email_scheduling_failed" })); }
}
