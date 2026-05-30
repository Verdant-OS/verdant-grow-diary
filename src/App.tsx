import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import AppShell from "@/components/AppShell";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Tents from "./pages/Tents";
import TentDetail from "./pages/TentDetail";
import Plants from "./pages/Plants";
import PlantDetail from "./pages/PlantDetail";
import Sensors from "./pages/Sensors";
import Tasks from "./pages/Tasks";
// Cameras removed from current Verdant build (out of V0 scope).
import Alerts from "./pages/Alerts";
import AlertDetail from "./pages/AlertDetail";
import Settings from "./pages/Settings";
import Timeline from "./pages/Timeline";
import Grows from "./pages/Grows";
import GrowDetail from "./pages/GrowDetail";

import Coach from "./pages/Coach";
import AiDoctorSessionDetail from "./pages/AiDoctorSessionDetail";
import AiDoctorSessionsIndex from "./pages/AiDoctorSessionsIndex";
import Diagnostics from "./pages/Diagnostics";
import ActionQueue from "./pages/ActionQueue";
import ActionDetail from "./pages/ActionDetail";
import GrowLineageRepair from "./pages/GrowLineageRepair";
import GrowRoomMode from "./pages/GrowRoomMode";
import DailyCheck from "./pages/DailyCheck";
import Landing from "./pages/Landing";
import HardwareIntegrations from "./pages/HardwareIntegrations";
import Pricing from "./pages/Pricing";
import BillingPlaceholder from "./pages/BillingPlaceholder";
import Leads from "./pages/Leads";
import PiIngestStatus from "./pages/PiIngestStatus";
import NotFound from "./pages/NotFound";



const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <GrowsProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/welcome" element={<Landing />} />
              <Route path="/hardware-integrations" element={<HardwareIntegrations />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/billing/:plan" element={<BillingPlaceholder />} />

              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/grow-room" element={<GrowRoomMode />} />
                <Route path="/daily-check" element={<DailyCheck />} />
                <Route path="/tents" element={<Tents />} />
                <Route path="/tents/:id" element={<TentDetail />} />
                <Route path="/plants" element={<Plants />} />
                <Route path="/plants/:id" element={<PlantDetail />} />
                <Route path="/sensors" element={<Sensors />} />
                <Route path="/logs" element={<Timeline />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/tasks" element={<Tasks />} />
                {/* /cameras route removed — out of current V0 scope. */}
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/alerts/:alertId" element={<AlertDetail />} />
                <Route path="/doctor" element={<Coach />} />
                <Route path="/doctor/sessions" element={<AiDoctorSessionsIndex />} />
                <Route path="/doctor/sessions/:sessionId" element={<AiDoctorSessionDetail />} />
                <Route path="/actions" element={<ActionQueue />} />
                <Route path="/actions/:actionId" element={<ActionDetail />} />
                {/* Legacy alias — canonical route is /actions. Keeps old
                    bookmarks, docs, and external links working. */}
                <Route path="/action-queue" element={<Navigate to="/actions" replace />} />
                <Route path="/grow-lineage" element={<GrowLineageRepair />} />
                <Route path="/grows" element={<Grows />} />
                <Route path="/grows/:growId" element={<GrowDetail />} />

                <Route path="/settings" element={<Settings />} />
                <Route path="/diagnostics" element={<Diagnostics />} />
                <Route path="/pi-ingest-status" element={<PiIngestStatus />} />
                {/* Leads is an internal admin/operator module, intentionally not
                    surfaced in grower-facing navigation. Primary route is
                    /admin/leads; /leads is retained as a back-compat alias. */}
                <Route path="/admin/leads" element={<Leads />} />
                <Route path="/leads" element={<Leads />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </GrowsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
