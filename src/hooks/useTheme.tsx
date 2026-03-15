import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type ThemeSetting = "light" | "dark" | "system";

interface ThemeContextValue {
  themeSetting: ThemeSetting;
  resolved: "light" | "dark";
  setTheme: (t: ThemeSetting) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeSetting: "system",
  resolved: "dark",
  setTheme: () => {},
});

function getStoredTheme(): ThemeSetting {
  try {
    const v = localStorage.getItem("theme");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(setting: ThemeSetting): "light" | "dark" {
  return setting === "system" ? getSystemTheme() : setting;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeSetting, setThemeState] = useState<ThemeSetting>(getStoredTheme);
  const [resolved, setResolved] = useState<"light" | "dark">(() => resolve(themeSetting));

  const setTheme = (t: ThemeSetting) => {
    setThemeState(t);
    try { localStorage.setItem("theme", t); } catch {}
  };

  // Apply class
  useEffect(() => {
    const r = resolve(themeSetting);
    setResolved(r);
    const root = document.documentElement;
    root.classList.toggle("dark", r === "dark");
  }, [themeSetting]);

  // Listen for system theme changes when set to "system"
  useEffect(() => {
    if (themeSetting !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = getSystemTheme();
      setResolved(r);
      document.documentElement.classList.toggle("dark", r === "dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeSetting]);

  return (
    <ThemeContext.Provider value={{ themeSetting, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
