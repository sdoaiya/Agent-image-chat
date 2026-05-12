import { NavLink } from "react-router-dom";
import { Compass, ImagePlus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "工作台", shortLabel: "工作", icon: ImagePlus, exact: true },
  { to: "/examples", label: "示例库", shortLabel: "示例", icon: Compass },
];

interface MainNavigationProps {
  activePath: string;
  onOpenSettings: () => void;
}

export function MainNavigation({ activePath, onOpenSettings }: MainNavigationProps) {
  return (
    <aside className="flex h-full w-[76px] shrink-0 flex-col items-center border-r border-sidebar-border bg-rail">
      <nav className="titlebar-no-drag flex min-h-0 flex-1 flex-col items-center gap-2 px-2 pt-8">
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
                "flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium leading-none transition-colors",
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

      <div className="titlebar-no-drag flex w-full flex-col items-center gap-2 px-2 pb-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
        <button
          type="button"
          onClick={onOpenSettings}
          title="设置"
          className="flex w-full flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium text-rail-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="打开设置"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="max-w-full truncate">设置</span>
        </button>
      </div>
    </aside>
  );
}
