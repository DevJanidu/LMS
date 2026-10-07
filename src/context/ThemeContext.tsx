"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";
interface ThemeState {
  themeMode: ThemeMode;
  theme: ResolvedTheme;
}
interface ThemeContextType extends ThemeState {
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}
const serverState: ThemeState = { themeMode: "light", theme: "light" };
let current = serverState;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function apply(mode: ThemeMode) {
  const theme =
    mode === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  current = { themeMode: mode, theme };
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.setAttribute("data-color-scheme", theme);
  listeners.forEach((listener) => listener());
}
function setThemeMode(mode: ThemeMode) {
  document.cookie = `sf-theme=${mode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  apply(mode);
}
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
/** Existing theme context backed by browser preference events. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribe,
    () => current,
    () => serverState,
  );
  useEffect(() => {
    const mode = document.cookie.match(/(?:^|; )sf-theme=(dark|light|auto)(?:;|$)/)?.[1] ?? "light";
    apply(mode === "dark" || mode === "auto" ? mode : "light");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      if (current.themeMode === "auto") apply("auto");
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <ThemeContext.Provider
      value={{
        ...state,
        setThemeMode,
        toggleTheme: () =>
          setThemeMode(current.theme === "light" ? "dark" : "light"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
