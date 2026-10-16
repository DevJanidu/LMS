"use client";
import { createContext, useContext } from "react";

type ThemeMode = "light" | "dark" | "auto";
/** Lets the sidebar account menu persist a theme choice the same way the header toggle does. */
export const AccountThemeContext = createContext<((mode: ThemeMode) => void) | null>(null);
export const useSaveTheme = () => useContext(AccountThemeContext);
