import { Routes, Route, Outlet } from "react-router-dom"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"

import DashboardPage from "@/pages/dashboard"
import WorkflowsPage from "@/pages/workflows"
import WorkflowDetailPage from "@/pages/workflow-detail"
import CollectionsPage from "@/pages/collections"
import QueryPage from "@/pages/query"
import EvalDashboardPage from "@/pages/eval-dashboard"
import EvalDatasetsPage from "@/pages/eval-datasets"
import EvalRunDetailPage from "@/pages/eval-run-detail"
import SettingsPage from "@/pages/settings"
import PipelineWizardPage from "@/pages/pipeline-wizard"

function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:id" element={<WorkflowDetailPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/query" element={<QueryPage />} />
        <Route path="/eval" element={<EvalDashboardPage />} />
        <Route path="/eval/datasets" element={<EvalDatasetsPage />} />
        <Route path="/eval/runs/:id" element={<EvalRunDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/pipeline" element={<PipelineWizardPage />} />
      </Route>
    </Routes>
  )
}

export default App
