"use client";
import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import ProgressBar from "@/components/studyflow/ProgressBar";
import type { FlashcardsData } from "@/lib/aven/ui-blocks";
import type { SavedState } from "@/lib/aven/ui-components";
import ActionCard from "../cards/ActionCard";
import { useBlockState } from "./useBlockState";
import SaveIndicator from "./SaveIndicator";
type State = { index: number; known: string[]; reviewing: string[] };
const EMPTY: State = { index: 0, known: [], reviewing: [] };
interface Props {
  id: string;
  data: FlashcardsData;
  requestId?: string;
  saved: SavedState<State> | null;
  persist: boolean;
}
/** Flip, step through and self-assess cards; position and confidence are saved. */
export default function FlashcardsBlock({ id, data, requestId, saved, persist }: Props) {
  const t = useTranslations("aven.blocks");
  const state = useBlockState<State>({ requestId, componentId: id, saved, initial: EMPTY, persist });
  const [flipped, setFlipped] = useState(false);
  const index = Math.min(state.data.index, data.cards.length - 1),
    card = data.cards[index];
  const go = (next: number) => {
    setFlipped(false);
    state.update((current) => ({ ...current, index: Math.max(0, Math.min(data.cards.length - 1, next)) }));
  };
  const mark = (known: boolean) => {
    state.update((current) => ({
      index: Math.min(data.cards.length - 1, current.index + 1),
      known: known ? [...new Set([...current.known, card.id])] : current.known.filter((value) => value !== card.id),
      reviewing: known
        ? current.reviewing.filter((value) => value !== card.id)
        : [...new Set([...current.reviewing, card.id])],
    }));
    setFlipped(false);
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "ArrowLeft") go(index - 1);
    else return;
    event.preventDefault();
  };
  const known = state.data.known.length;
  return (
    <ActionCard
      eyebrow={t("flashcards")}
      title={data.title}
      status={<span className="aven-pill">{t("knownCount", { known, total: data.cards.length })}</span>}
      footer={<SaveIndicator status={state.status} />}
    >
      <ProgressBar value={Math.round((known / data.cards.length) * 100)} label={t("knownCount", { known, total: data.cards.length })} />
      <div className="aven-flashcard-stage" onKeyDown={keys}>
        <button
          type="button"
          className="aven-flashcard"
          data-flipped={flipped || undefined}
          aria-pressed={flipped}
          aria-label={t(flipped ? "showFront" : "showBack")}
          onClick={() => setFlipped((value) => !value)}
        >
          <span className="aven-flashcard-face" aria-hidden={flipped}>
            <span className="aven-card-meta">{t("front")}</span>
            <span className="aven-flashcard-text">{card.front}</span>
          </span>
          <span className="aven-flashcard-face" data-back aria-hidden={!flipped}>
            <span className="aven-card-meta">{t("back")}</span>
            <span className="aven-flashcard-text">{card.back}</span>
          </span>
        </button>
        <span className="sr-only" aria-live="polite">
          {flipped ? card.back : card.front}
        </span>
      </div>
      <div className="aven-flashcard-controls">
        <button type="button" className="aven-icon-button" aria-label={t("previous")} disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="aven-card-meta">{t("cardPosition", { position: index + 1, total: data.cards.length })}</span>
        <button
          type="button"
          className="aven-icon-button"
          aria-label={t("next")}
          disabled={index === data.cards.length - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
        {flipped && (
          <span className="aven-flashcard-assess">
            <Button size="sm" variant="outline" onClick={() => mark(false)}>
              {t("reviewAgain")}
            </Button>
            <Button size="sm" onClick={() => mark(true)}>
              {t("knewIt")}
            </Button>
          </span>
        )}
      </div>
    </ActionCard>
  );
}
