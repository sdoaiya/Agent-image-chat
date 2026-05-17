import { NavLink } from "react-router-dom";
import { Compass, ImagePlus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import gimgLogo from "@/assets/gimg-logo.svg";
import { useSettings, type ImageProvider } from "@/store/settings";

const navItems = [
  { to: "/", label: "工作台", shortLabel: "工作", icon: ImagePlus, exact: true },
  { to: "/examples", label: "示例库", shortLabel: "示例", icon: Compass },
];

const providerLabels: Record<ImageProvider, string> = {
  codesonline: "CodesOnline",
  openrouter: "OpenRouter",
  blt: "BLT",
};

interface MainNavigationProps {
  activePath: string;
  onOpenSettings: () => void;
}

export function MainNavigation({ activePath, onOpenSettings }: MainNavigationProps) {
  const provider = useSettings((state) => state.provider);
  const apiKey = useSettings((state) => state.apiKey);
  const providerApiKeys = useSettings((state) => state.providerApiKeys);
  const configuredCount = (["codesonline", "openrouter", "blt"] as ImageProvider[]).filter((item) => {
    const key = item === provider ? apiKey : providerApiKeys[item];
    return Boolean(key?.trim());
  }).length;

  return (
    <aside className="gimg-rail flex h-full shrink-0 flex-col items-center border-r border-sidebar-border bg-rail px-2 py-4">
      <div className="titlebar-no-drag gimg-brand-mark" aria-label="GIMG">
        <img src={gimgLogo} alt="GIMG" className="gimg-brand-mark-image" />
      </div>

      <nav className="titlebar-no-drag gimg-rail-nav flex min-h-0 flex-1 flex-col items-center gap-2">
        {navItems.map((item) => {
          const isActive = item.exact ? activePath === item.to : activePath.startsWith(item.to);
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              title={item.label}
              aria-label={item.label}
              className={cn(
                "gimg-rail-button flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium leading-none transition-colors",
                isActive
                  ? "bg-primary/95 text-primary-foreground shadow-sm"
                  : "text-rail-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{item.shortLabel}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="titlebar-no-drag gimg-rail-footer flex w-full flex-col items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          title="设置"
          className="gimg-rail-button flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium text-rail-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="打开设置"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="max-w-full truncate">设置</span>
        </button>

        <div
          className="gimg-rail-status"
          aria-label={`当前 Provider ${providerLabels[provider]}，已配置 ${configuredCount} / 3 个来源`}
        >
          <span>
            <span className="gimg-rail-status-dot" />
            {providerLabels[provider]}
          </span>
          <span>{configuredCount}/3 已配置</span>
        </div>
      </div>
    </aside>
  );
}
