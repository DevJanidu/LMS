"use client";
import { useCallback, useEffect, useRef, useState } from "react";
const read = (key: string) => {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
const write = (key: string, value: string) => {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {}
};
/** Per-conversation composer drafts that survive refreshes within the browser session. */
export function useAvenDraft(userId: string, initial: string) {
  const keyFor = useCallback(
    (conversationId: string | null) =>
      `aven-draft:${userId}:${conversationId ?? "new"}`,
    [userId],
  );
  const [value, setValue] = useState(initial),
    key = useRef(keyFor(null)),
    latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    const timer = setTimeout(() => write(key.current, value), 300);
    return () => clearTimeout(timer);
  }, [value]);
  /** Save the current draft (unless restoring on load), then load the draft for another conversation. */
  const switchTo = useCallback(
    (conversationId: string | null, save = true) => {
      if (save) write(key.current, latest.current);
      key.current = keyFor(conversationId);
      setValue(read(key.current));
    },
    [keyFor],
  );
  /** A new conversation received its id: move the (already sent) draft without reloading it. */
  const adopt = useCallback(
    (conversationId: string) => {
      write(key.current, "");
      key.current = keyFor(conversationId);
    },
    [keyFor],
  );
  return { value, setValue, switchTo, adopt };
}
