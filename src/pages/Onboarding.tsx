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
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/store/auth";
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
import PublicQuickLogHandoffCard from "@/components/PublicQuickLogHandoffCard";

export default function Onboarding() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [choice, setChoice] = useState<StartScreenChoice>(DEFAULT_START_SCREEN);
  const [starterBusy, setStarterBusy] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  async function handleStarterSetup() {
    if (starterBusy || !user) return;
    setStarterError(null);
    setStarterBusy(true);
    try {
      const result = await runStarterSetup(user.id, starterSetupSupabaseAdapter);
      const prefill = buildStarterQuickLogPrefill(result);
      // AppShell listens for this event globally and opens Quick Log with
      // the plant/tent/grow preselected. No sensor snapshot is inserted;
      // the grower still authors the first log manually. Stay inside the
      // current AppShell so its listener is not replaced before receiving
      // this in-memory handoff.
      window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: prefill }));
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
          Start with your grow diary first. You can change this later.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Verdant works best when logs come first, then sensors, then AI.
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
            onClick={handleStarterSetup}
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
