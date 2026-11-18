// Light / dark / system appearance. The choice is a harmless preference saved in this browser.
// Browser-only functions: call them from effects or event handlers, not during server rendering.

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "ai-parenting-coach:theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function loadTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked or full: the choice still applies for this visit.
  }
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
}

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", resolveTheme(theme, prefersDark) === "dark");
}

/**
 * Runs in <head> before the first paint so a dark-mode visitor never sees a white flash.
 * It must stay in sync with applyTheme above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;
