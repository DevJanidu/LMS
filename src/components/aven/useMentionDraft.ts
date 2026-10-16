"use client";
import { useEffect, useRef, useState } from "react";
import { mentionTypes } from "@/lib/aven/commands";
import { activeMentions, type ComposerMention } from "./composer-model";
const isMention = (value: unknown): value is ComposerMention =>
  Boolean(value) &&
  typeof value === "object" &&
  mentionTypes.includes((value as ComposerMention).type) &&
  typeof (value as ComposerMention).id === "string" &&
  typeof (value as ComposerMention).label === "string";
/**
 * Picked mentions for the composer draft, kept in this browser session so a refresh
 * keeps tokens attached. They are restored once the saved draft text loads and only
 * while their tokens are still in it; the server re-validates every reference anyway.
 */
export function useMentionDraft(userId: string, draft: string) {
  const key = `aven-mentions:${userId}`;
  const [mentions, setMentions] = useState<ComposerMention[]>([]);
  const saved = useRef<ComposerMention[] | null>(null);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      saved.current = Array.isArray(stored) ? stored.filter(isMention) : [];
    } catch {
      saved.current = [];
    }
  }, [key]);
  useEffect(() => {
    if (!saved.current?.length || !draft) return;
    const restored = activeMentions(draft, saved.current);
    saved.current = null;
    if (restored.length) setMentions(restored);
  }, [draft]);
  useEffect(() => {
    // Until the saved list has been considered, an empty state must not erase it.
    if (saved.current?.length && !mentions.length) return;
    try {
      if (mentions.length) sessionStorage.setItem(key, JSON.stringify(mentions));
      else sessionStorage.removeItem(key);
    } catch {}
  }, [key, mentions]);
  return [mentions, setMentions] as const;
}
