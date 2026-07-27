"use client";

/**
 * Day paper / night paper (DESIGN.md §2).
 *
 * "system" follows prefers-color-scheme by leaving data-theme off the root.
 * An explicit choice stamps data-theme="light" | "dark", which tokens.css lets
 * win over the OS in both directions.
 */

import type { Theme } from "@tracker/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const THEME_STORAGE_KEY = "tracker.theme";

/** Runs before first paint so night paper never flashes bone. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="day"){document.documentElement.setAttribute("data-theme","light")}else if(t==="night"){document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})();`;

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "day") root.setAttribute("data-theme", "light");
  else if (theme === "night") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "day" || stored === "night" || stored === "system") return stored;
  } catch {
    // Private mode / storage disabled — fall through to system.
  }
  return "system";
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start at "system" on the server; the bootstrap script has already applied
  // the stored value to <html>, so there is nothing to repaint.
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}
