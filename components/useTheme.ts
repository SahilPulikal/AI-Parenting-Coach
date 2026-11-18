"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { applyTheme, loadTheme, saveTheme, type Theme } from "@/lib/theme";

const listeners = new Set<() => void>();
// Remembers the choice even when localStorage is blocked, so the switch still works this visit.
let chosen: Theme | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

const getSnapshot = (): Theme => chosen ?? loadTheme();
const getServerSnapshot = (): Theme => "system";

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system"); // follow the operating system while on "system"
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    chosen = next;
    saveTheme(next);
    listeners.forEach((notify) => notify());
  }, []);

  return { theme, setTheme };
}
