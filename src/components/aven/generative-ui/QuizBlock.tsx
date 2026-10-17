"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
import ProgressBar from "@/components/studyflow/ProgressBar";
import { featureRequest } from "@/lib/goals/client";
import type { QuizData } from "@/lib/aven/ui-blocks";
import type { SavedState } from "@/lib/aven/ui-components";
import ActionCard from "../cards/ActionCard";
import { errorKey } from "../types";
import { useBlockEnvironment } from "./BlockContext";
type Answer = { choice: number; correct: boolean; correctIndex: number; explanation: string };
type State = { answers: Record<string, Answer> };
interface Props {
  id: string;
  data: QuizData;
  requestId?: string;
  saved: SavedState<State> | null;
  persist: boolean;
}
/**
 * Multiple choice graded on the server: the answer key never reaches the browser, and the
 * first answer to each question counts (a double click or a second tab cannot change it).
 */
export default function QuizBlock({ id, data, requestId, saved, persist }: Props) {
  const t = useTranslations("aven.blocks"),
    root = useTranslations("aven");
  const { conversationId, onSaved } = useBlockEnvironment();
  const [answers, setAnswers] = useState<Record<string, Answer>>(saved?.data.answers ?? {}),
    [selected, setSelected] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState<string>(),
    [error, setError] = useState("");
  // Answers saved elsewhere (refresh, another tab) appear here too.
  useEffect(() => {
    if (saved) setAnswers(saved.data.answers);
  }, [saved]);
  const ready = persist && Boolean(conversationId && requestId);
  const answered = Object.keys(answers).length,
    score = Object.values(answers).filter((answer) => answer.correct).length;
  const submit = async (questionId: string) => {
    const choice = selected[questionId];
    if (choice === undefined || busy || !ready) return;
    setBusy(questionId);
    setError("");
    try {
      const response = await featureRequest<{ state: SavedState<State> }>("/api/aven/components", {
        kind: "quizAnswer",
        conversationId,
        requestId,
        componentId: id,
        questionId,
        choice,
      });
      setAnswers(response.state.data.answers);
      onSaved();
    } catch (failure) {
      setError(root(errorKey(root, (failure as Error).message)));
    } finally {
      setBusy(undefined);
    }
  };
  const retry = async () => {
    if (busy || !ready) return;
    setBusy("reset");
    try {
      const response = await featureRequest<{ state: SavedState<State> }>("/api/aven/components", {
        kind: "quizReset",
        conversationId,
        requestId,
        componentId: id,
      });
      setAnswers(response.state.data.answers);
      setSelected({});
      onSaved();
    } catch (failure) {
      setError(root(errorKey(root, (failure as Error).message)));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <ActionCard
      eyebrow={t("quiz")}
      title={data.title}
      status={
        <span className="aven-pill" data-tone={answered === data.questions.length ? "completed" : "pending"}>
          {t("score", { score, total: data.questions.length })}
        </span>
      }
      footer={
        answered > 0 ? (
          <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void retry()}>
            {t("retryQuiz")}
          </Button>
        ) : undefined
      }
    >
      <ProgressBar
        value={Math.round((answered / data.questions.length) * 100)}
        label={t("quizProgress", { answered, total: data.questions.length })}
      />
      {!ready && <p className="aven-card-note">{t("quizWaiting")}</p>}
      <ol className="aven-quiz">
        {data.questions.map((question, number) => {
          const answer = answers[question.id];
          return (
            <li key={question.id} className="aven-quiz-question" data-result={answer ? (answer.correct ? "correct" : "incorrect") : undefined}>
              <fieldset disabled={Boolean(answer) || busy === question.id || !ready}>
                <legend className="aven-quiz-prompt">
                  <span className="aven-card-meta">{t("questionNumber", { number: number + 1 })}</span>
                  {question.prompt}
                </legend>
                <div className="aven-quiz-options">
                  {question.options.map((option, index) => {
                    const state = answer
                      ? index === answer.correctIndex
                        ? "correct"
                        : index === answer.choice
                          ? "incorrect"
                          : undefined
                      : undefined;
                    return (
                      <label key={index} className="aven-option" data-state={state}>
                        <input
                          type="radio"
                          name={`${id}-${question.id}`}
                          checked={answer ? answer.choice === index : selected[question.id] === index}
                          onChange={() => setSelected((current) => ({ ...current, [question.id]: index }))}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {answer ? (
                <div className="aven-quiz-feedback" role="status">
                  <strong>{t(answer.correct ? "correct" : "incorrect")}</strong>
                  {answer.explanation && <p>{answer.explanation}</p>}
                </div>
              ) : (
                <Button
                  size="sm"
                  disabled={selected[question.id] === undefined || Boolean(busy) || !ready}
                  onClick={() => void submit(question.id)}
                >
                  {t("checkAnswer")}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="aven-block-error">
          {error}
        </p>
      )}
    </ActionCard>
  );
}
