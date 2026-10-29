/**
 * Home — the signed-in grower's apex surface.
 *
 * `/` renders the grower's chosen view: Simple for everyone with no explicit
 * choice, the full Dashboard (Advanced) once chosen. `/dashboard` is a direct
 * link to the Dashboard itself, so it always renders Advanced; the bar above it
 * still offers Simple, and choosing Simple there goes home. Both views read the
 * same records under the same entitlements; this page only decides which
 * presenter to mount.
 *
 * While no choice is known on this device and the account read is pending, a
 * short loading state is shown instead of guessing: flashing Simple at a grower
 * who chose Advanced on their phone would be a reset they did not ask for.
 */
import { lazy, Suspense, useCallback } from "react";
import { useNavigate } from "@/lib/react-router-compat";
import { useAuth } from "@/store/auth";
import { useUiViewPreference } from "@/hooks/useUiViewPreference";
import { UI_VIEW_COPY, type UiView } from "@/lib/uiViewPreferenceRules";
import UiViewSwitch from "@/components/UiViewSwitch";
import SimpleHome from "@/pages/SimpleHome";

const Dashboard = lazy(() => import("@/pages/Dashboard"));

export const HOME_ROUTE = "/" as const;

interface Props {
  /**
   * "advanced" pins the Dashboard regardless of the saved preference. Used by
   * the direct `/dashboard` link, which is an explicit destination.
   */
  forceView?: "advanced";
}

function HomeLoader({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="home-view-loading"
      className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
    >
      <span className="sr-only">Loading…</span>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

export default function Home({ forceView }: Props = {}) {
  const { user } = useAuth();
  const preference = useUiViewPreference(user);
  const nav = useNavigate();
  const forcedAdvanced = forceView === "advanced";

  const choose = useCallback(
    async (view: UiView) => {
      const saved = await preference.setView(view);
      // A direct Dashboard link cannot show Simple; take the grower home so
      // the view they chose is the view they see, even if the save failed
      // (the failure notice travels with the pending choice).
      if (forcedAdvanced && view === "simple") nav(HOME_ROUTE);
      return saved;
    },
    [forcedAdvanced, nav, preference],
  );

  if (!forcedAdvanced && preference.status === "loading") {
    return <HomeLoader label={UI_VIEW_COPY.loading} />;
  }

  if (!forcedAdvanced && preference.view === "simple") return <SimpleHome />;

  return (
    <div
      data-testid="home-advanced-view"
      data-forced-view={forcedAdvanced ? "advanced" : undefined}
    >
      <div
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-secondary/20 px-3 py-2"
        data-testid="home-advanced-view-bar"
      >
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{UI_VIEW_COPY.advancedLabel}</span>
          {" · "}
          {UI_VIEW_COPY.advancedDescription}
        </p>
        <UiViewSwitch
          current="advanced"
          onChoose={choose}
          save={preference.save}
          accountUnavailable={preference.status === "unavailable"}
        />
      </div>
      <Suspense fallback={<HomeLoader label="Opening the dashboard…" />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}
