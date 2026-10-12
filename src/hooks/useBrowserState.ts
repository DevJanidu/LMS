"use client";
import { useCallback, useSyncExternalStore } from "react";
const LOCAL_EVENT = "acadence-local-storage";
const subscribeStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(LOCAL_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LOCAL_EVENT, callback);
  };
};
/** A localStorage value shared across tabs; renders `null` on the server and during hydration. */
export function useLocalStorage(key: string) {
  const value = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = useCallback(
    (next: string | null) => {
      try {
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {}
      window.dispatchEvent(new Event(LOCAL_EVENT));
    },
    [key],
  );
  return [value, set] as const;
}
