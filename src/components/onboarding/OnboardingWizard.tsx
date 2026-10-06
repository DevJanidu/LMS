"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { newId, updateWorkspace, useWorkspace } from "@/lib/mock/store";
import type { Topic, Workspace } from "@/types";
import { APP_NAME } from "@/lib/constants";
import { getSubjects } from "@/lib/mock";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import ProgressBar from "@/components/studyflow/ProgressBar";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
interface Props {
  initial: Workspace;
  initialStep?: number;
}
/** Skippable first-study setup with one task per step. */
export default function OnboardingWizard({ initial, initialStep = 0 }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState(
    data.user.learningContext ?? "selfStudy",
  );
  const [topics, setTopics] = useState("");
  const [hours, setHours] = useState(12);
  const [subjectId, setSubjectId] = useState(getSubjects(data)[0]?.id ?? "");
  const [error, setError] = useState("");
  const keys = [
    "welcome",
    "learningContext",
    "firstSubject",
    "firstTopics",
    "weeklyGoal",
  ];
  const next = (skip: boolean) => {
    setError("");
    if (!skip) {
      if (step === 1)
        updateWorkspace(initial, (state) => ({
          ...state,
          user: { ...state.user, learningContext: context },
        }));
      if (step === 2 && title.trim()) {
        const id = newId();
        setSubjectId(id);
        updateWorkspace(initial, (state) => {
          const now = new Date().toISOString();
          return {
            ...state,
            subjects: [
              ...state.subjects,
              {
                id,
                userId: state.user.id,
                title: title.trim(),
                description: "",
                color: "brand",
                status: "active",
                createdAt: now,
                updatedAt: now,
              },
            ],
          };
        });
      }
      if (step === 3 && topics.trim() && subjectId) {
        const titles = topics
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (
          titles.length +
            data.topics.filter((topic) => topic.subjectId === subjectId)
              .length >
          200
        ) {
          setError(t("topicLimit"));
          return;
        }
        updateWorkspace(initial, (state) => {
          const now = new Date().toISOString();
          const offset = state.topics.filter(
            (topic) => topic.subjectId === subjectId,
          ).length;
          return {
            ...state,
            topics: [
              ...state.topics,
              ...titles.map((name, index): Topic => ({
                id: newId(),
                subjectId,
                title: name,
                status: "notStarted",
                sortOrder: offset + index,
                createdAt: now,
                updatedAt: now,
              })),
            ],
          };
        });
      }
      if (step === 4)
        updateWorkspace(initial, (state) => ({
          ...state,
          user: { ...state.user, weeklyTargetMinutes: Math.round(hours * 60) },
        }));
    }
    if (step === 4) router.push("/dashboard");
    else setStep(step + 1);
  };
  return (
    <div className="sf-onboarding mx-auto w-full max-w-lg">
      <p className="mb-3 text-theme-xs text-brand-600 dark:text-brand-300">
        {t("stepOf", { step: step + 1, total: 5 })}
      </p>
      <ProgressBar value={(step + 1) * 20} label={t("onboarding")} />
      <div className="mt-7">
        <PageHeader
          title={t(keys[step], { appName: APP_NAME })}
          description={t("onboardingDescription")}
        />
      </div>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          next(false);
        }}
      >
        {step === 0 && (
          <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {t("welcomeHelp")}
          </p>
        )}
        {step === 1 && (
          <SelectField
            label={t("learningContext")}
            value={context}
            onChange={(event) => setContext(event.target.value)}
          >
            {["school", "university", "exam", "selfStudy", "other"].map(
              (key) => (
                <option key={key} value={key}>
                  {t(`contexts.${key}`)}
                </option>
              ),
            )}
          </SelectField>
        )}
        {step === 2 && (
          <>
            <Field
              label={t("subjectTitle")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={150}
            />
            <div className="flex flex-wrap gap-2">
              {["maths", "science", "english", "programming"].map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => setTitle(t(`examples.${key}`))}
                >
                  {t(`examples.${key}`)}
                </Button>
              ))}
            </div>
          </>
        )}
        {step === 3 &&
          (subjectId ? (
            <TextField
              label={t("onePerLine")}
              value={topics}
              onChange={(event) => setTopics(event.target.value)}
            />
          ) : (
            <p className="text-sm">{t("topicsLater")}</p>
          ))}
        {step === 4 && (
          <Field
            label={t("weeklyGoalHours")}
            type="number"
            min={0}
            max={168}
            step={0.5}
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
          />
        )}{" "}
        {error && (
          <p
            role="alert"
            className="text-sm text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" className="flex-1">
            {t(step === 4 ? "goDashboard" : "continue")}
          </Button>
          <Button variant="outline" onClick={() => next(true)}>
            {t("skip")}
          </Button>
        </div>
      </form>
    </div>
  );
}
