// Post-sign-in start-screen choice. Diary-first by default.
//
// Safety:
//  - No backend write. No schema change. No grow/sensor mutation.
//  - All routes pass through sanitizeAuthRedirect.
//  - Never stores tokens, sessions, hashes, or grow data.
//
// Accessibility:
//  - Heading is the default focus target.
//  - Options are native radios inside a semantic fieldset, exposed as a
//    radiogroup. Native radios already support arrow-key navigation and
//    Space/Enter selection.
//  - "Skip for now" lands on the Quick Log diary-first route without
//    persisting a preference.
//  - "Change later" copy points to Settings.
import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate, Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_START_SCREEN,
  START_SCREEN_OPTIONS,
  routeForStartScreen,
  setStartScreenChoice,
  type StartScreenChoice,
} from "@/lib/startScreenPreferences";
import {
  buildStarterQuickLogPrefill,
  STARTER_SETUP_BUTTON_LABEL,
  STARTER_SETUP_ERROR_COPY,
  STARTER_SETUP_HELPER_COPY,
} from "@/lib/starterSetupRules";
import { runStarterSetup, StarterSetupError } from "@/lib/starterSetupService";
import { starterSetupSupabaseAdapter } from "@/lib/starterSetupSupabaseAdapter";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import PublicQuickLogHandoffCard from "@/components/PublicQuickLogHandoffCard";
import {
  buildCsvHistoryImportHandoffHref,
  CSV_HISTORY_ONBOARDING_COPY,
  CSV_HISTORY_ONBOARDING_HANDOFF_ERROR_COPY,
  CSV_HISTORY_ONBOARDING_IMPORT_LABEL,
  CSV_HISTORY_ONBOARDING_READY_COPY,
  CSV_HISTORY_ONBOARDING_SETUP_LABEL,
  CSV_HISTORY_ONBOARDING_TITLE,
  readCsvHistoryOnboardingIntent,
} from "@/lib/csvHistoryOnboardingIntentRules";

export default function Onboarding() {
  const { user, loading } = useAuth();
  const { refresh: refreshGrows } = useGrows();
  const queryClient = useQueryClient();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [choice, setChoice] = useState<StartScreenChoice>(DEFAULT_START_SCREEN);
  const [starterBusy, setStarterBusy] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);
  const [csvHistoryImportHref, setCsvHistoryImportHref] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const csvHistoryIntent = readCsvHistoryOnboardingIntent(searchParams);

  useEffect(() => {
    // Land focus on the heading so screen readers announce context first and
    // keyboard users can tab directly into the radiogroup.
    headingRef.current?.focus();
  }, []);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  function go(c: StartScreenChoice, save: boolean) {
    if (save && user) setStartScreenChoice(user.id, c);
    nav(routeForStartScreen(c), { replace: true });
  }

  async function handleStarterSetup(next: "quick_log" | "csv_history") {
    if (starterBusy || !user) return;
    setStarterError(null);
    setStarterBusy(true);
    try {
      const result = await runStarterSetup(user.id, starterSetupSupabaseAdapter, {
        onCreated(entity) {
          if (entity === "grow") trackFunnelEvent("grow_created");
          if (entity === "tent") trackFunnelEvent("tent_created");
          if (entity === "plant") trackFunnelEvent("plant_created");
        },
      });
      // Quick Log is permanently mounted and may still hold the pre-setup
      // empty lists. Refresh every selector it uses before dispatching the
      // in-memory handoff so the new grow/tent/plant can be selected and saved
      // immediately, without waiting for a focus refetch or page reload.
      await Promise.all([
        refreshGrows(),
        queryClient.invalidateQueries({ queryKey: ["tents"] }),
        queryClient.invalidateQueries({ queryKey: ["plants"] }),
      ]);
      if (next === "quick_log") {
        const prefill = buildStarterQuickLogPrefill(result);
        // AppShell listens for this event globally and opens Quick Log with
        // the plant/tent/grow preselected. No sensor snapshot is inserted;
        // the grower still authors the first log manually. Stay inside the
        // current AppShell so its listener is not replaced before receiving
        // this in-memory handoff.
        window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: prefill }));
      } else {
        const handoffHref = buildCsvHistoryImportHandoffHref(result.tentId);
        if (!handoffHref) {
          setStarterError(CSV_HISTORY_ONBOARDING_HANDOFF_ERROR_COPY);
          return;
        }
        // This is navigation-only. It does not open a file picker, import a
        // CSV, invoke AI Doctor, or create an Action Queue item.
        setCsvHistoryImportHref(handoffHref);
        trackFunnelEvent("csv_history_onboarding_ready", { surface: "onboarding" });
      }
    } catch (err) {
      const message =
        err instanceof StarterSetupError ? STARTER_SETUP_ERROR_COPY : STARTER_SETUP_ERROR_COPY;
      setStarterError(message);
    } finally {
      setStarterBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md glass rounded-2xl p-6">
        <h1
          ref={headingRef}
          tabIndex={-1}
          id="onboarding-heading"
          className="text-2xl font-display font-bold mb-1 outline-none"
        >
          Where do you want Verdant to open first?
        </h1>
        <p className="text-sm text-muted-foreground mb-1">
          {csvHistoryIntent
            ? "Set up one grow and tent, then continue to your CSV history import."
            : "Start with your grow diary first. You can change this later."}
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          {csvHistoryIntent
            ? "Imported history stays labeled as CSV context, never live telemetry."
            : "Verdant works best when logs come first, then sensors, then AI."}
        </p>

        <PublicQuickLogHandoffCard className="mb-4" />

        <fieldset
          role="radiogroup"
          aria-labelledby="onboarding-heading"
          className="grid gap-2 mb-4 border-0 p-0"
        >
          <legend className="sr-only">Choose your start screen</legend>
          {START_SCREEN_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition focus-within:ring-2 focus-within:ring-ring ${
                choice === opt.key ? "border-primary bg-secondary/40" : "border-border/50"
              }`}
            >
              <input
                type="radio"
                name="start-screen"
                value={opt.key}
                checked={choice === opt.key}
                onChange={() => setChoice(opt.key)}
                className="mt-1"
                aria-describedby={`start-screen-${opt.key}-desc`}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {opt.label}
                  {opt.recommended ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span
                  id={`start-screen-${opt.key}-desc`}
                  className="block text-xs text-muted-foreground"
                >
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => go(DEFAULT_START_SCREEN, false)}>
            Skip for now
          </Button>
          <Button
            onClick={() => go(choice, true)}
            className="gradient-leaf text-primary-foreground"
          >
            Continue
          </Button>
        </div>

        {csvHistoryIntent ? (
          <section
            data-testid="csv-history-onboarding-handoff"
            aria-labelledby="csv-history-onboarding-title"
            className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4"
          >
            <h2
              id="csv-history-onboarding-title"
              className="text-xs font-semibold uppercase tracking-wide text-primary"
            >
              {CSV_HISTORY_ONBOARDING_TITLE}
            </h2>
            <p className="mt-2 text-sm text-foreground/90">{CSV_HISTORY_ONBOARDING_COPY}</p>
            {csvHistoryImportHref ? (
              <div className="mt-3 space-y-3">
                <p
                  data-testid="csv-history-onboarding-ready"
                  role="status"
                  className="text-xs text-muted-foreground"
                >
                  {CSV_HISTORY_ONBOARDING_READY_COPY}
                </p>
                <Button asChild className="w-full sm:w-auto">
                  <Link to={csvHistoryImportHref} data-testid="csv-history-onboarding-import-cta">
                    {CSV_HISTORY_ONBOARDING_IMPORT_LABEL}
                  </Link>
                </Button>
              </div>
            ) : (
              <Button
                data-testid="csv-history-onboarding-setup-button"
                type="button"
                variant="outline"
                className="mt-3 w-full sm:w-auto"
                disabled={starterBusy}
                onClick={() => {
                  void handleStarterSetup("csv_history");
                }}
              >
                {starterBusy ? "Creating starter setup…" : CSV_HISTORY_ONBOARDING_SETUP_LABEL}
              </Button>
            )}
            {starterError ? (
              <p
                data-testid="csv-history-onboarding-error"
                role="alert"
                className="mt-3 text-xs text-destructive"
              >
                {starterError}
              </p>
            ) : null}
          </section>
        ) : (
          <div
            data-testid="starter-setup-block"
            className="mt-6 rounded-lg border border-border/60 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Just want to try Quick Log?
            </p>
            <p className="mt-2 text-sm text-foreground/90">{STARTER_SETUP_HELPER_COPY}</p>
            <Button
              data-testid="starter-setup-button"
              type="button"
              variant="outline"
              className="mt-3 w-full sm:w-auto"
              disabled={starterBusy}
              onClick={() => {
                void handleStarterSetup("quick_log");
              }}
            >
              {starterBusy ? "Creating starter setup…" : STARTER_SETUP_BUTTON_LABEL}
            </Button>
            {starterError ? (
              <p
                data-testid="starter-setup-error"
                role="alert"
                className="mt-3 text-xs text-destructive"
              >
                {starterError}
              </p>
            ) : null}
          </div>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground text-center">
          You can change this later from{" "}
          <Link
            to="/settings"
            className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Settings
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
