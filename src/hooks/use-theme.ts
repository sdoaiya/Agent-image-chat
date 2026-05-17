import { useEffect } from "react";
import { useSettings } from "@/store/settings";

function getSystemTheme(): "light" | "dark" {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function useTheme() {
  const theme = useSettings((s) => s.theme);
  const tone = useSettings((s) => s.tone);

  useEffect(() => {
    const resolved = tone === "dark" ? "dark" : theme === "system" ? getSystemTheme() : theme;
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-tone", tone);

    if (resolved === "dark") {
      root.style.colorScheme = "dark";
    } else {
      root.style.colorScheme = "light";
    }

    if (window.electronAPI?.updateTheme) {
      window.electronAPI.updateTheme(resolved);
    }
  }, [theme, tone]);

  useEffect(() => {
    if (theme !== "system" || tone === "dark") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = getSystemTheme();
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.setAttribute("data-tone", tone);
      document.documentElement.style.colorScheme = resolved;
      if (window.electronAPI?.updateTheme) {
        window.electronAPI.updateTheme(resolved);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme, tone]);
}
