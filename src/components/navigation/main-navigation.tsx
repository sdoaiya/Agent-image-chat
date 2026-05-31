import { NavLink } from "react-router-dom";
import { Compass, ImagePlus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

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
    <aside className="main-rail flex h-full w-[76px] shrink-0 flex-col items-center border-r border-sidebar-border bg-rail">
      <nav className="main-rail-nav titlebar-no-drag flex min-h-0 flex-1 flex-col items-center gap-2 px-2 pt-8">
        <NavLink to="/" title="GIMG 工作台" aria-label="GIMG 工作台" className="main-rail-brand">
          <img src={logoSrc} alt="" draggable={false} />
        </NavLink>
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
                "main-rail-link flex w-full flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium leading-none transition-colors",
                isActive ? "main-rail-link--active" : "text-rail-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate">{item.shortLabel}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="main-rail-footer titlebar-no-drag flex w-full flex-col items-center gap-2 px-2 pb-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
        <button
          type="button"
          onClick={onOpenSettings}
          title="设置"
          className="main-rail-link flex w-full flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium text-rail-foreground transition-colors"
          aria-label="打开设置"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span className="max-w-full truncate">设置</span>
        </button>
      </div>
    </aside>
  );
}
