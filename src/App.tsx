import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import { useGoogleAnalyticsPageViews } from "@/hooks/useGoogleAnalyticsPageViews";
import AppShell from "@/components/AppShell";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Tents from "./pages/Tents";
import TentDetail from "./pages/TentDetail";
import Plants from "./pages/Plants";
import PlantDetail from "./pages/PlantDetail";
import Sensors from "./pages/Sensors";
import EcowittIngestAudit from "./pages/EcowittIngestAudit";
import SensorsIngestNormalizer from "./pages/SensorsIngestNormalizer";
import Tasks from "./pages/Tasks";
// Cameras removed from current Verdant build (out of V0 scope).
import Alerts from "./pages/Alerts";
import AlertDetail from "./pages/AlertDetail";
import Settings from "./pages/Settings";
import Timeline from "./pages/Timeline";
import Grows from "./pages/Grows";
import GrowDetail from "./pages/GrowDetail";
import Reports from "./pages/Reports";

import Coach from "./pages/Coach";
import AiDoctorSessionDetail from "./pages/AiDoctorSessionDetail";
import AiDoctorSessionsIndex from "./pages/AiDoctorSessionsIndex";
import Diagnostics from "./pages/Diagnostics";
import ActionQueue from "./pages/ActionQueue";
import OperatorEcowittCanary from "./pages/OperatorEcowittCanary";
import OperatorEcowittTentPreview from "./pages/OperatorEcowittTentPreview";

import EcowittBridgeStatus from "./pages/EcowittBridgeStatus";
import EcowittBridgeDebug from "./pages/EcowittBridgeDebug";
import OneTentProofRecord from "./pages/OneTentProofRecord";
import ActionDetail from "./pages/ActionDetail";
import GrowLineageRepair from "./pages/GrowLineageRepair";
// GrowRoomMode (legacy Live Dashboard) consolidated into Dashboard; /grow-room redirects.
import DailyCheck from "./pages/DailyCheck";
import Landing from "./pages/Landing";
// Demo page removed — Verdant is positioned around real grow data only.
import HardwareIntegrations from "./pages/HardwareIntegrations";
import Pricing from "./pages/Pricing";
import BillingPlaceholder from "./pages/BillingPlaceholder";
import Leads from "./pages/Leads";
import PiIngestStatus from "./pages/PiIngestStatus";
import IngestInspector from "./pages/IngestInspector";
import NotFound from "./pages/NotFound";
import AiDoctorPhase1Preview from "./pages/AiDoctorPhase1Preview";
import OneTentLoopProof from "./pages/OneTentLoopProof";
import SensorTruthAudit from "./pages/SensorTruthAudit";
import AiDoctorConfidenceAudit from "./pages/AiDoctorConfidenceAudit";
import EcowittLiveBringup from "./pages/EcowittLiveBringup";
import EnvironmentSummaryReportPage from "./pages/EnvironmentSummaryReportPage";
import OperatorOneTentLoopSmokeTest from "./pages/OperatorOneTentLoopSmokeTest";

const queryClient = new QueryClient();

function AnalyticsShell() {
  useGoogleAnalyticsPageViews();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnalyticsShell />
        <AuthProvider>
          <GrowsProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Deprecated auth entry points — redirect to canonical /auth to
                  prevent funnel leaks from old bookmarks, emails, ads, and
                  creator posts that still point to /login /signup /register. */}
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/signup" element={<Navigate to="/auth" replace />} />
              <Route path="/register" element={<Navigate to="/auth" replace />} />

              <Route path="/features" element={<Navigate to="/welcome" replace />} />

              <Route path="/welcome" element={<Landing />} />
              {/* /demo route removed — Verdant tracks real grow data only.
                  Old bookmarks redirect to the landing page. */}
              <Route path="/demo" element={<Navigate to="/welcome" replace />} />
              <Route path="/hardware-integrations" element={<HardwareIntegrations />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/billing/:plan" element={<BillingPlaceholder />} />
              

              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/onboarding" element={<Onboarding />} />
                {/* Legacy Live Dashboard route — consolidated into the
                    main Dashboard. Redirect preserves old bookmarks. */}
                <Route path="/grow-room" element={<Navigate to="/" replace />} />

                <Route path="/daily-check" element={<DailyCheck />} />
                <Route path="/tents" element={<Tents />} />
                <Route path="/tents/:id" element={<TentDetail />} />
                <Route path="/plants" element={<Plants />} />
                <Route path="/plants/:id" element={<PlantDetail />} />
                <Route path="/sensors" element={<Sensors />} />
                <Route path="/sensors/ecowitt-audit" element={<EcowittIngestAudit />} />
                <Route path="/sensors/ingest-normalizer" element={<SensorsIngestNormalizer />} />
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
                <Route path="/reports" element={<Reports />} />
                <Route
                  path="/diary/environment-summary"
                  element={<EnvironmentSummaryReportPage />}
                />

                <Route path="/settings" element={<Settings />} />
                <Route path="/diagnostics" element={<Diagnostics />} />
                <Route path="/operator/ecowitt" element={<OperatorEcowittCanary />} />
                <Route path="/operator/one-tent-proof-record" element={<OneTentProofRecord />} />
                <Route path="/operator/ecowitt-bridge-status" element={<EcowittBridgeStatus />} />
                <Route path="/operator/ecowitt-bridge-debug" element={<EcowittBridgeDebug />} />
                <Route path="/operator/ecowitt-live-bringup" element={<EcowittLiveBringup />} />
                <Route
                  path="/operator/ecowitt-tent-preview"
                  element={<OperatorEcowittTentPreview />}
                />
                
                <Route
                  path="/operator/one-tent-loop-smoke-test"
                  element={<OperatorOneTentLoopSmokeTest />}
                />
                <Route path="/pi-ingest-status" element={<PiIngestStatus />} />
                <Route path="/ingest-inspector" element={<IngestInspector />} />
                <Route
                  path="/internal/ai-doctor-phase1-preview"
                  element={<AiDoctorPhase1Preview />}
                />
                <Route path="/internal/one-tent-loop-proof" element={<OneTentLoopProof />} />
                <Route path="/internal/sensor-truth-audit" element={<SensorTruthAudit />} />
                <Route
                  path="/internal/ai-doctor-confidence-audit"
                  element={<AiDoctorConfidenceAudit />}
                />
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
