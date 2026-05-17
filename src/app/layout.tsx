import { HashRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { useYouMindPromptSync } from "@/hooks/use-youmind-prompt-sync";
import { useSettings } from "@/store/settings";

function ThemeAndToaster() {
  useTheme();
  const theme = useSettings((s) => s.theme);
  const tone = useSettings((s) => s.tone);
  const resolved = tone === "dark"
    ? "dark"
    : theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  return <Toaster theme={resolved as "light" | "dark"} position="bottom-right" />;
}

function YouMindBackgroundSync() {
  useYouMindPromptSync({ enabled: true });
  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <HashRouter>
      <div className="app-window-drag gimg-shell flex h-screen flex-col bg-background text-foreground">
        {children}
      </div>
      <YouMindBackgroundSync />
      <ThemeAndToaster />
    </HashRouter>
  );
}
