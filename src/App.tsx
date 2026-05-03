import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/app/layout";
import { WorkbenchLayout } from "@/app/workbench-layout";
import { CanvasPage } from "@/app/canvas/page";
import { ExamplesPage } from "@/app/examples/page";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<WorkbenchLayout />}>
          <Route index element={<CanvasPage />} />
          <Route path="examples" element={<ExamplesPage />} />
        </Route>
      </Routes>
    </AppShell>
  );
}
