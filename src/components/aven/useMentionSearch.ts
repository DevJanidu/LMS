"use client";
import { useEffect, useRef, useState } from "react";
import type { MentionType } from "@/lib/aven/commands";
import type { ComposerMention } from "./composer-model";
export interface MentionOption extends ComposerMention {
  detail: string;
}
interface Page {
  items: MentionOption[];
  nextOffset: number | null;
}
const DEBOUNCE_MS = 150;
/**
 * Debounced mention search. Stale requests are aborted; pages are cached for this
 * component only (per account, in memory), so nothing leaks between users.
 */
export function useMentionSearch(query: string | null, types: readonly MentionType[] = []) {
  const cache = useRef(new Map<string, Page>());
  const [state, setState] = useState<{ key: string; page: Page; loading: boolean; error: boolean }>({
    key: "",
    page: { items: [], nextOffset: null },
    loading: false,
    error: false,
  });
  const [offset, setOffset] = useState(0);
  const typeKey = types.join(",");
  const key = query === null ? "" : `${typeKey}|${query.trim().toLowerCase()}`;
  // A new query starts from the first page.
  useEffect(() => setOffset(0), [key]);
  useEffect(() => {
    if (query === null) return;
    const pageKey = `${key}|${offset}`;
    const cached = cache.current.get(pageKey);
    if (cached) {
      setState((current) => ({
        key,
        page: offset ? { items: [...current.page.items, ...cached.items], nextOffset: cached.nextOffset } : cached,
        loading: false,
        error: false,
      }));
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, key, loading: true, error: false }));
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), offset: String(offset) });
        if (typeKey) params.set("types", typeKey);
        const response = await fetch(`/api/aven/mentions?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const value = await response.json();
        if (!response.ok || value.ok === false) throw new Error(value.error);
        const page: Page = { items: value.items, nextOffset: value.nextOffset };
        cache.current.set(pageKey, page);
        setState((current) => ({
          key,
          page: offset ? { items: [...current.page.items, ...page.items], nextOffset: page.nextOffset } : page,
          loading: false,
          error: false,
        }));
      } catch {
        if (!controller.signal.aborted)
          setState((current) => ({ ...current, loading: false, error: true }));
      }
    }, offset ? 0 : DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, offset, query, typeKey]);
  const current = state.key === key;
  return {
    items: current ? state.page.items : [],
    loading: query !== null && (!current || state.loading),
    error: current && state.error,
    hasMore: current && state.page.nextOffset !== null,
    loadMore: () => {
      if (current && state.page.nextOffset !== null && !state.loading)
        setOffset(state.page.nextOffset);
    },
  };
}
