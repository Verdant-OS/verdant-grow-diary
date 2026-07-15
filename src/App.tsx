import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import { useGoogleAnalyticsPageViews } from "@/hooks/useGoogleAnalyticsPageViews";
import RootErrorBoundary from "@/components/RootErrorBoundary";
import PhenoTrackerUpgradeGate from "@/components/PhenoTrackerUpgradeGate";
import RequireOperatorRole from "./components/RequireOperatorRole";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { AgreementReconsentGate } from "@/components/AgreementReconsentGate";

// Route pages and the authenticated AppShell are code-split so the public
// marketing / auth entry paths (/welcome, /pricing, /hardware-integrations,
// /pheno-comparison, /auth) never download the entire authenticated app.
// Each page becomes its own chunk, loaded on demand under the <Suspense>
// boundary below. Route paths are unchanged — only the import mechanism.
const AppShell = lazy(() => import("@/components/AppShell"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tents = lazy(() => import("./pages/Tents"));
const TentDetail = lazy(() => import("./pages/TentDetail"));
const Plants = lazy(() => import("./pages/Plants"));
const PlantDetail = lazy(() => import("./pages/PlantDetail"));
const Sensors = lazy(() => import("./pages/Sensors"));
const EcowittIngestAudit = lazy(() => import("./pages/EcowittIngestAudit"));
const SensorsIngestNormalizer = lazy(() => import("./pages/SensorsIngestNormalizer"));
const Tasks = lazy(() => import("./pages/Tasks"));
// Cameras removed from current Verdant build (out of V0 scope).
const Alerts = lazy(() => import("./pages/Alerts"));
const AlertDetail = lazy(() => import("./pages/AlertDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const AccountPreferences = lazy(() => import("./pages/AccountPreferences"));
const AgentIntegrations = lazy(() => import("./pages/AgentIntegrations"));
const Timeline = lazy(() => import("./pages/Timeline"));
const Grows = lazy(() => import("./pages/Grows"));
const GrowDetail = lazy(() => import("./pages/GrowDetail"));
const GrowLearning = lazy(() => import("./pages/GrowLearning"));
const PhenoHuntNew = lazy(() => import("./pages/PhenoHuntNew"));
const PhenoHuntCompare = lazy(() => import("./pages/PhenoHuntCompare"));
const PhenoHuntWorkspace = lazy(() => import("./pages/PhenoHuntWorkspace"));
const PhenoKeepersPage = lazy(() => import("./pages/PhenoKeepersPage"));
const BreedingLogNew = lazy(() => import("./pages/BreedingLogNew"));
const BreedingProgramsIndex = lazy(() => import("./pages/BreedingProgramsIndex"));
const BreedingProgramNew = lazy(() => import("./pages/BreedingProgramNew"));
const BreedingProgramDetail = lazy(() => import("./pages/BreedingProgramDetail"));
const Reports = lazy(() => import("./pages/Reports"));
const PostGrowLearningReport = lazy(() => import("./pages/PostGrowLearningReport"));

const Coach = lazy(() => import("./pages/Coach"));
const AiDoctorSessionDetail = lazy(() => import("./pages/AiDoctorSessionDetail"));
const AiDoctorSessionsIndex = lazy(() => import("./pages/AiDoctorSessionsIndex"));
const Diagnostics = lazy(() => import("./pages/Diagnostics"));
const ActionQueue = lazy(() => import("./pages/ActionQueue"));
const OperatorEcowittCanary = lazy(() => import("./pages/OperatorEcowittCanary"));
const OperatorEcowittTentPreview = lazy(() => import("./pages/OperatorEcowittTentPreview"));
const OperatorPaddleProcessingAudit = lazy(() => import("./pages/OperatorPaddleProcessingAudit"));
const OperatorBillingSubscriptionUpdateAudit = lazy(
  () => import("./pages/OperatorBillingSubscriptionUpdateAudit"),
);
const OperatorBillingEntitlementResolutionAudit = lazy(
  () => import("./pages/OperatorBillingEntitlementResolutionAudit"),
);

const EcowittBridgeStatus = lazy(() => import("./pages/EcowittBridgeStatus"));
const EcowittBridgeDebug = lazy(() => import("./pages/EcowittBridgeDebug"));
const OneTentProofRecord = lazy(() => import("./pages/OneTentProofRecord"));
const ActionDetail = lazy(() => import("./pages/ActionDetail"));
const GrowLineageRepair = lazy(() => import("./pages/GrowLineageRepair"));
// GrowRoomMode (legacy Live Dashboard) consolidated into Dashboard; /grow-room redirects.
const DailyCheck = lazy(() => import("./pages/DailyCheck"));
const Landing = lazy(() => import("./pages/Landing"));
// Demo page removed — Verdant is positioned around real grow data only.
const HardwareIntegrations = lazy(() => import("./pages/HardwareIntegrations"));
const CreatorBeta = lazy(() => import("./pages/CreatorBeta"));
const BreederBeta = lazy(() => import("./pages/BreederBeta"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const GuidesIndex = lazy(() => import("./pages/GuidesIndex"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
const GrowStageCareGuide = lazy(() => import("./pages/GrowStageCareGuide"));
const Glossary = lazy(() => import("./pages/Glossary"));
const HowAiDoctorWorks = lazy(() => import("./pages/HowAiDoctorWorks"));
const LegacyBillingRedirect = lazy(() => import("./pages/LegacyBillingRedirect"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("./pages/CheckoutCancel"));
const Terms = lazy(() => import("./pages/TermsOfService"));
const Privacy = lazy(() => import("./pages/PrivacyPolicy"));
const Refund = lazy(() => import("./pages/RefundPolicy"));

const Leads = lazy(() => import("./pages/Leads"));
const PiIngestStatus = lazy(() => import("./pages/PiIngestStatus"));
const IngestInspector = lazy(() => import("./pages/IngestInspector"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AiDoctorPhase1Preview = lazy(() => import("./pages/AiDoctorPhase1Preview"));
const OneTentLoopProof = lazy(() => import("./pages/OneTentLoopProof"));
const OneTentLoopLiveProof = lazy(() => import("./pages/OneTentLoopLiveProof"));
const SensorTruthAudit = lazy(() => import("./pages/SensorTruthAudit"));
const AiDoctorConfidenceAudit = lazy(() => import("./pages/AiDoctorConfidenceAudit"));
const EcowittLiveBringup = lazy(() => import("./pages/EcowittLiveBringup"));
const EnvironmentSummaryReportPage = lazy(() => import("./pages/EnvironmentSummaryReportPage"));
const OperatorOneTentLoopSmokeTest = lazy(() => import("./pages/OperatorOneTentLoopSmokeTest"));
const OperatorGgsRealPayloadIngest = lazy(() => import("./pages/OperatorGgsRealPayloadIngest"));
const OperatorPostGrowReflectionDryRun = lazy(
  () => import("./pages/OperatorPostGrowReflectionDryRun"),
);
const OperatorDemoPreview = lazy(() => import("./pages/OperatorDemoPreview"));
const CustomerModeGuide = lazy(() => import("./pages/CustomerModeGuide"));
const CustomerModeCannabisCareFaq = lazy(() => import("./pages/CustomerModeCannabisCareFaq"));
const OperatorAiDoctorPhase1Page = lazy(() =>
  import("./pages/OperatorAiDoctorPhase1").then((m) => ({
    default: m.OperatorAiDoctorPhase1Page,
  })),
);
const OneTentLiveProof = lazy(() => import("./pages/OneTentLiveProof"));
const DemoProofWalkthrough = lazy(() => import("./pages/DemoProofWalkthrough"));
const ContextualPhenoComparisonDemo = lazy(() => import("./pages/ContextualPhenoComparisonDemo"));
const PhenoComparison = lazy(() => import("./pages/PhenoComparison"));
const PhenoExpressionShowcase = lazy(() => import("./pages/PhenoExpressionShowcase"));
const QuickLogStarter = lazy(() => import("./pages/QuickLogStarter"));
const ReleaseReadiness = lazy(() => import("./pages/ReleaseReadiness"));
const HealthCheck = lazy(() => import("./pages/HealthCheck"));

const queryClient = new QueryClient();

function AnalyticsShell() {
  useGoogleAnalyticsPageViews();
  return null;
}

/** Minimal, dependency-free fallback shown while a route chunk loads. */
function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span className="sr-only">Loading…</span>
    </div>
  );
}

const App = () => (
  <RootErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnalyticsShell />
          <AuthProvider>
            <GrowsProvider>
              <PaymentTestModeBanner />
              <AgreementReconsentGate />

              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
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
                  <Route path="/creator-beta" element={<CreatorBeta />} />
                  <Route path="/breeder-beta" element={<BreederBeta />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/upgrade" element={<Upgrade />} />
                  <Route path="/guides" element={<GuidesIndex />} />
                  <Route path="/guides/grow-stage-care-guide" element={<GrowStageCareGuide />} />
                  <Route path="/guides/:slug" element={<GuidePage />} />
                  <Route path="/glossary" element={<Glossary />} />
                  <Route path="/how-ai-doctor-works" element={<HowAiDoctorWorks />} />
                  {/* Legacy `/billing/:plan` entry — Slice E: redirect to
                      canonical `/upgrade` with plan preselect + safe returnTo. */}
                  <Route path="/billing/:plan" element={<LegacyBillingRedirect />} />
                  <Route path="/checkout/success" element={<CheckoutSuccess />} />
                  <Route path="/checkout/cancel" element={<CheckoutCancel />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/refund" element={<Refund />} />
                  <Route path="/refunds" element={<Navigate to="/refund" replace />} />
                  <Route path="/refund-policy" element={<Navigate to="/refund" replace />} />
                  <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
                  <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />

                  {/* Public Customer Mode shell. Mounted OUTSIDE AppShell so
                      no operator chrome (header, Quick Log) renders. */}
                  <Route path="/customer/:shareId" element={<CustomerModeGuide />} />
                  <Route
                    path="/customer/:shareId/cannabis-care"
                    element={<CustomerModeCannabisCareFaq />}
                  />

                  {/* Internal read-only walkthrough presenter. Mounted OUTSIDE
                      AppShell so the no-write E2E guard can render it without a
                      signed-in session. The page performs no Supabase / AI /
                      alerts / Action Queue / device-control calls. Path remains
                      unlinked and is hidden by URL only. */}
                  <Route
                    path="/internal/demo-proof-walkthrough"
                    element={<DemoProofWalkthrough />}
                  />

                  {/* Internal read-only Contextual Pheno Comparison v0.1 demo.
                      Uses labeled fixture data only — no fetch, no Supabase,
                      no AI, no writes. Hidden by URL only. */}
                  <Route
                    path="/internal/contextual-pheno-comparison-demo"
                    element={<ContextualPhenoComparisonDemo />}
                  />

                  {/* Read-only Pheno Comparison PREVIEW surface. Fixture-only,
                      no fetch/Supabase/AI/writes. Mounted outside AppShell so
                      the read-only surface renders without operator chrome. */}
                  <Route path="/pheno-comparison" element={<PhenoComparison />} />
                  {/* Mix-and-match showcase of ten example phenos (demo,
                      fixture-only, network-free). Read-only. */}
                  <Route path="/pheno-expression-showcase" element={<PhenoExpressionShowcase />} />
                  {/* LIVE per-hunt comparison. Reads the grower's own hunt via
                      RLS-scoped SELECT (empty/graceful without a session);
                      still read-only — no writes/AI/automation. */}
                  <Route path="/pheno-hunts/:id/compare" element={<PhenoHuntCompare />} />

                  {/* Public 30-second Quick Log starter. Local draft on this
                      device only — no Supabase/AI/device calls, no fake-live
                      data. Mounted outside AppShell so no operator chrome
                      renders. */}
                  <Route path="/quick-log" element={<QuickLogStarter />} />

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
                    <Route path="/timeline" element={<Timeline />} />
                    {/* Legacy alias — canonical route is /timeline. */}
                    <Route path="/logs" element={<Navigate to="/timeline" replace />} />
                    <Route path="/tasks" element={<Tasks />} />
                    {/* /cameras route removed — out of current V0 scope. */}
                    <Route path="/alerts" element={<Alerts />} />
                    <Route path="/alerts/:alertId" element={<AlertDetail />} />
                    <Route path="/doctor" element={<Coach />} />
                    {/* Legacy alias — canonical route is /doctor. Growers
                        sometimes type /ai-doctor; redirect rather than 404. */}
                    <Route path="/ai-doctor" element={<Navigate to="/doctor" replace />} />
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
                    <Route path="/grows/:growId/learning" element={<GrowLearning />} />
                    {/* Pheno Tracker is a Verdant Pro feature. Free and
                        canceled/expired users see an upgrade card. Public
                        read-only /pheno-comparison and /pheno-hunts/:id/compare
                        remain ungated above so historical records stay
                        viewable — we never hide diary history as a billing
                        punishment. Server-side entitlement enforcement is a
                        follow-up slice; this PR is UI/route gating only. */}
                    <Route
                      path="/pheno-hunts/new"
                      element={
                        <PhenoTrackerUpgradeGate>
                          <PhenoHuntNew />
                        </PhenoTrackerUpgradeGate>
                      }
                    />
                    <Route
                      path="/pheno-hunts/:id/workspace"
                      element={
                        <PhenoTrackerUpgradeGate>
                          <PhenoHuntWorkspace />
                        </PhenoTrackerUpgradeGate>
                      }
                    />
                    <Route
                      path="/pheno-hunts/:id/keepers"
                      element={
                        <PhenoTrackerUpgradeGate>
                          <PhenoKeepersPage />
                        </PhenoTrackerUpgradeGate>
                      }
                    />
                    <Route path="/breeding" element={<BreedingProgramsIndex />} />
                    <Route path="/breeding/new" element={<BreedingProgramNew />} />
                    <Route path="/breeding/:programId" element={<BreedingProgramDetail />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/reports/post-grow/:growId" element={<PostGrowLearningReport />} />
                    <Route
                      path="/diary/environment-summary"
                      element={<EnvironmentSummaryReportPage />}
                    />

                    <Route path="/settings" element={<Settings />} />
                    <Route path="/settings/agent-integrations" element={<AgentIntegrations />} />
                    <Route path="/account/preferences" element={<AccountPreferences />} />
                    <Route path="/health" element={<HealthCheck />} />
                    {/* Operator-only routes. Authenticated via AppShell's useRequireAuth,
                        then gated by server-side has_role('operator') via RequireOperatorRole.
                        Non-operator users see a calm access-restricted state. */}
                    <Route element={<RequireOperatorRole />}>
                      {/* UI Simplification Slice 0 — /demo/one-tent-live-proof is a
                          proof artifact, not a grower-facing page. Operator role
                          required; /operator/one-tent-live-proof remains the
                          canonical operator entry. */}
                      <Route path="/demo/one-tent-live-proof" element={<OneTentLiveProof />} />
                      <Route path="/operator/ecowitt" element={<OperatorEcowittCanary />} />
                      <Route
                        path="/operator/ai-doctor-phase1"
                        element={<OperatorAiDoctorPhase1Page />}
                      />
                      <Route
                        path="/operator/paddle-processing-audit"
                        element={<OperatorPaddleProcessingAudit />}
                      />
                      <Route
                        path="/operator/billing-subscription-updates"
                        element={<OperatorBillingSubscriptionUpdateAudit />}
                      />
                      <Route
                        path="/operator/billing-entitlement-resolution"
                        element={<OperatorBillingEntitlementResolutionAudit />}
                      />
                      <Route
                        path="/operator/one-tent-proof-record"
                        element={<OneTentProofRecord />}
                      />
                      <Route path="/operator/one-tent-live-proof" element={<OneTentLiveProof />} />
                      <Route
                        path="/operator/ecowitt-bridge-status"
                        element={<EcowittBridgeStatus />}
                      />
                      <Route
                        path="/operator/ecowitt-bridge-debug"
                        element={<EcowittBridgeDebug />}
                      />
                      <Route
                        path="/operator/ecowitt-live-bringup"
                        element={<EcowittLiveBringup />}
                      />
                      <Route
                        path="/operator/ecowitt-tent-preview"
                        element={<OperatorEcowittTentPreview />}
                      />
                      <Route
                        path="/operator/one-tent-loop-smoke-test"
                        element={<OperatorOneTentLoopSmokeTest />}
                      />
                      <Route
                        path="/operator/post-grow-reflection-dry-run"
                        element={<OperatorPostGrowReflectionDryRun />}
                      />
                      <Route
                        path="/operator/ggs-real-payload-ingest"
                        element={<OperatorGgsRealPayloadIngest />}
                      />
                      <Route path="/operator/demo-preview" element={<OperatorDemoPreview />} />
                      <Route path="/operator/release-readiness" element={<ReleaseReadiness />} />
                      {/* Diagnostics Audience Split v1 — /diagnostics is an
                          operator-only RLS / round-trip / DevOps surface; manifest
                          already declared access: "operator". */}
                      <Route path="/diagnostics" element={<Diagnostics />} />
                      {/* Route Guard Parity v1 — these operator/internal routes
                          were previously only authenticated. They now require
                          the server-side `operator` role to match their
                          appRouteManifest access metadata. */}
                      <Route path="/pi-ingest-status" element={<PiIngestStatus />} />
                      <Route path="/ingest-inspector" element={<IngestInspector />} />
                      <Route
                        path="/internal/ai-doctor-phase1-preview"
                        element={<AiDoctorPhase1Preview />}
                      />
                      <Route path="/internal/one-tent-loop-proof" element={<OneTentLoopProof />} />
                      <Route path="/one-tent-loop-proof" element={<OneTentLoopLiveProof />} />
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
                      {/* Sensor Debug Route Guard Cleanup v1 — operator-only
                          sensor debug surfaces. Manifest already declares
                          access: "operator"; now enforced server-side via
                          RequireOperatorRole. */}
                      <Route path="/sensors/ecowitt-audit" element={<EcowittIngestAudit />} />
                      <Route
                        path="/sensors/ingest-normalizer"
                        element={<SensorsIngestNormalizer />}
                      />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </GrowsProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </RootErrorBoundary>
);

export default App;
