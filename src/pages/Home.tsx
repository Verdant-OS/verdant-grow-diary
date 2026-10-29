/**
 * Home — the signed-in grower's apex surface (`/` and `/dashboard`).
 *
 * Simple View is the default for every grower with no explicit choice. An
 * explicit choice saved on the account picks Simple or the full Dashboard
 * (Advanced). Both views read the same records under the same entitlements;
 * this page only decides which presenter to mount.
 *
 * While no choice is known on this device and the account read is pending, a
 * short loading state is shown instead of guessing: flashing Simple at a grower
 * who chose Advanced on their phone would be a reset they did not ask for.
 */
import { lazy, Suspense } from "react";
import { useAuth } from "@/store/auth";
import { useUiViewPreference } from "@/hooks/useUiViewPreference";
import { UI_VIEW_COPY } from "@/lib/uiViewPreferenceRules";
import UiViewSwitch from "@/components/UiViewSwitch";
import SimpleHome from "@/pages/SimpleHome";

const Dashboard = lazy(() => import("@/pages/Dashboard"));

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

export default function Home() {
  const { user } = useAuth();
  const preference = useUiViewPreference(user);

  if (preference.status === "loading") return <HomeLoader label={UI_VIEW_COPY.loading} />;

  if (preference.view === "simple") return <SimpleHome />;

  return (
    <div data-testid="home-advanced-view">
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
          onChoose={preference.setView}
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
