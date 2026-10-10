"use client";
import { useState } from "react";
import { completeOnboarding } from "@/app/[locale]/actions";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Workspace } from "@/types";
import { APP_NAME } from "@/lib/constants";
import { onboardingSchema } from "@/lib/validation/onboarding";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import ProgressBar from "@/components/studyflow/ProgressBar";
import Field, { SelectField, TextField } from "@/components/studyflow/FormFields";

interface Props { initial: Workspace; initialStep?: number; }
type FormState = {
  learningContext: "school" | "university" | "exam" | "selfStudy" | "other";
  subjectTitle: string;
  topics: string;
  weeklyTargetHours: number;
};

/** All onboarding edits stay in memory until the final atomic save. */
export default function OnboardingWizard({ initial, initialStep = 0 }: Props) {
  const t = useTranslations("studyflow");
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const initialContext = ["school", "university", "exam", "selfStudy", "other"].includes(initial.user.learningContext ?? "") ? initial.user.learningContext as FormState["learningContext"] : "selfStudy";
  const [form, setForm] = useState<FormState>({ learningContext: initialContext, subjectTitle: "", topics: "", weeklyTargetHours: 12 });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const keys = ["welcome", "learningContext", "firstSubject", "firstTopics", "weeklyGoal"];
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));

  const next = async (skip: boolean) => {
    if (pending) return;
    setError("");
    if (!skip) {
      if (step === 2 && !form.subjectTitle.trim()) { setError(t("invalidInput")); return; }
      if (step === 3 && form.topics.split(/\r?\n/).map(line => line.trim()).filter(Boolean).length > 200) { setError(t("topicLimit")); return; }
      if (step === 4 && (form.weeklyTargetHours < 0 || form.weeklyTargetHours > 168 || Number.isNaN(form.weeklyTargetHours))) { setError(t("invalidInput")); return; }
    }
    if (step < 4) {
      if (skip) {
        if (step === 1) update("learningContext", "selfStudy");
        if (step === 2) { update("subjectTitle", ""); update("topics", ""); }
        if (step === 3) update("topics", "");
      }
      setStep(current => current + 1);
      return;
    }
    const topicTitles = form.topics.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parsed = onboardingSchema.safeParse({ learningContext: form.learningContext, subjectTitle: form.subjectTitle.trim(), topicTitles, weeklyTargetHours: skip ? 0 : form.weeklyTargetHours });
    if (!parsed.success) { setError(t("invalidInput")); return; }
    setPending(true);
    try {
      const result = await completeOnboarding(parsed.data);
      if (!result.ok) { setError(t(result.error)); return; }
      router.replace("/dashboard");
    } catch { setError(t("saveFailed"));
    } finally { setPending(false); }
  };

  return (
    <div className="sf-onboarding mx-auto w-full max-w-lg">
      <p className="mb-3 text-small text-brand-600 dark:text-brand-300">{t("stepOf", { step: step + 1, total: 5 })}</p>
      <ProgressBar value={(step + 1) * 20} label={t("onboarding")} />
      <div className="mt-7"><PageHeader title={t(keys[step], { appName: APP_NAME })} description={t("onboardingDescription")} /></div>
      <form className="space-y-6" onSubmit={event => { event.preventDefault(); void next(false); }}>
        {step === 0 && <p className="text-body text-muted dark:text-secondary">{t("welcomeHelp")}</p>}
        {step === 1 && <SelectField label={t("learningContext")} value={form.learningContext} onChange={event => update("learningContext", event.target.value as FormState["learningContext"])}>{["school", "university", "exam", "selfStudy", "other"].map(key => <option key={key} value={key}>{t(`contexts.${key}`)}</option>)}</SelectField>}
        {step === 2 && <><Field label={t("subjectTitle")} value={form.subjectTitle} onChange={event => update("subjectTitle", event.target.value)} maxLength={150} /><div className="flex flex-wrap gap-2">{["maths", "science", "english", "programming"].map(key => <Button type="button" key={key} variant="outline" size="sm" onClick={() => update("subjectTitle", t(`examples.${key}`))}>{t(`examples.${key}`)}</Button>)}</div></>}
        {step === 3 && (form.subjectTitle.trim() ? <TextField label={t("onePerLine")} value={form.topics} onChange={event => update("topics", event.target.value)} /> : <p className="text-body">{t("topicsLater")}</p>)}
        {step === 4 && <Field label={t("weeklyGoalHours")} type="number" min={0} max={168} step={0.5} value={form.weeklyTargetHours} onChange={event => update("weeklyTargetHours", Number(event.target.value))} />}
        {error && <p role="alert" className="text-body text-error-600 dark:text-error-400">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" className="flex-1" disabled={pending}>{t(step === 4 ? "goDashboard" : "continue")}</Button>
          {step > 0 && <Button type="button" variant="outline" onClick={() => { setError(""); setStep(current => current - 1); }} disabled={pending}>{t("back")}</Button>}
          <Button type="button" variant="outline" onClick={() => void next(true)} disabled={pending}>{t("skip")}</Button>
        </div>
      </form>
    </div>
  );
}
