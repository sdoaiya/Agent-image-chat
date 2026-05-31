import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { MainNavigation } from "@/components/navigation/main-navigation";
import { SettingsDrawer } from "@/components/settings/settings-drawer";

export function WorkbenchLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      <div className="workbench-root flex h-screen bg-background text-foreground">
        <MainNavigation onOpenSettings={() => setSettingsOpen(true)} activePath={location.pathname} />
        <main className="workbench-main min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
