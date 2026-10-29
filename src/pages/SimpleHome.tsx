/**
 * SimpleHome — the ankle-deep home surface.
 *
 * Three things, in order: the grower's plants with tent context, one prominent
 * "Add an observation" action, and the most recent entries with a one-tap path
 * back to the saved observation. Everything reads through the same hooks and
 * saves through the same Quick Log sheet the rest of the app uses.
 *
 * Target rules: the big button opens Quick Log with no preselected target (the
 * sheet asks). A plant row's own button is an explicit choice and opens the
 * sheet on that plant. Nothing is remembered or auto-selected.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/react-router-compat";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Leaf, NotebookPen, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import GrowDataLoadError, { GrowDataLoadingState } from "@/components/GrowDataLoadError";
import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";
import UiViewSwitch from "@/components/UiViewSwitch";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import { useDashboardScopedData } from "@/hooks/useDashboardScopedData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useUiViewPreference } from "@/hooks/useUiViewPreference";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { timelinePath } from "@/lib/routes";
import {
  buildSimpleHomeState,
  SIMPLE_HOME_COPY,
  SIMPLE_HOME_SETUP_ROUTE,
  resolveSimpleHomeGrowId,
  selectSimpleHomeRecentEntries,
  type SimpleHomeReadStatus,
  type SimpleHomeState,
} from "@/lib/simpleHomeViewModel";

function readStatus(query: { isPending: boolean; isError: boolean }): SimpleHomeReadStatus {
  if (query.isPending) return "pending";
  if (query.isError) return "error";
  return "success";
}

export default function SimpleHome() {
  usePageSeo({
    title: "Home",
    description: "Your plants, one button to add an observation, and your recent entries.",
    path: "/",
    noindex: true,
  });
  const { user } = useAuth();
  const viewPreference = useUiViewPreference(user);
  const { grows, activeGrowId, loading: growsLoading, error: growsError, refresh } = useGrows();
  const { scopedGrow } = useScopedGrow();
  const scopedGrowId = scopedGrow?.id ?? null;

  // Resolve the grow first so tent and plant reads are scoped to it.
  const growId = growsLoading
    ? null
    : resolveSimpleHomeGrowId({ grows, scopedGrowId, activeGrowId });

  const tentsQuery = useGrowTents(growId ?? undefined);
  const plantsQuery = useGrowPlants(undefined, growId ?? undefined);

  const state: SimpleHomeState = buildSimpleHomeState({
    grows,
    growsLoading,
    growsError,
    scopedGrowId,
    activeGrowId,
    tents: { status: readStatus(tentsQuery), rows: tentsQuery.data },
    plants: { status: readStatus(plantsQuery), rows: plantsQuery.data },
  });

  const readyGrowId = state.kind === "ready" ? state.growId : null;
  const { recent, reload: reloadRecent } = useDashboardScopedData(readyGrowId);

  // A confirmed save anywhere in the app refreshes the recent list.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCreated = () => void reloadRecent();
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, onCreated);
  }, [reloadRecent]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [launchTargetKey, setLaunchTargetKey] = useState<string | null>(null);
  const openQuickLog = useCallback((targetKey: string | null) => {
    setLaunchTargetKey(targetKey);
    setSheetOpen(true);
  }, []);

  return (
    <div data-testid="simple-home" data-simple-home-state={state.kind}>
      <PageHeader
        title={SIMPLE_HOME_COPY.title}
        description={
          state.kind === "ready" && state.growName
            ? `Working in ${state.growName}.`
            : "Plant memory, one note at a time."
        }
        icon={<Leaf className="h-5 w-5" />}
        actions={
          <UiViewSwitch
            current="simple"
            onChoose={viewPreference.setView}
            save={viewPreference.save}
            accountUnavailable={viewPreference.status === "unavailable"}
          />
        }
      />

      {state.kind === "loading" ? (
        <GrowDataLoadingState
          resource={
            state.resource === "grows" ? "Grows" : state.resource === "tents" ? "Tents" : "Plants"
          }
          testId="simple-home-loading"
        />
      ) : null}

      {state.kind === "grows-error" ? (
        <GrowDataLoadError
          resource="Grows"
          testId="simple-home-grows-error"
          onRetry={() => void refresh()}
        />
      ) : null}
      {state.kind === "tents-error" ? (
        <GrowDataLoadError
          resource="Tents"
          testId="simple-home-tents-error"
          onRetry={() => void tentsQuery.refetch()}
        />
      ) : null}
      {state.kind === "plants-error" ? (
        <GrowDataLoadError
          resource="Plants"
          testId="simple-home-plants-error"
          onRetry={() => void plantsQuery.refetch()}
        />
      ) : null}

      {state.kind === "no-grow" ? (
        <SetupCard
          testId="simple-home-no-grow"
          title={SIMPLE_HOME_COPY.noGrowTitle}
          body={SIMPLE_HOME_COPY.noGrowBody}
          cta={SIMPLE_HOME_COPY.noGrowCta}
          href={SIMPLE_HOME_SETUP_ROUTE}
        />
      ) : null}
      {state.kind === "no-tent" ? (
        <SetupCard
          testId="simple-home-no-tent"
          title={SIMPLE_HOME_COPY.noTentTitle}
          body={SIMPLE_HOME_COPY.noTentBody}
          cta={SIMPLE_HOME_COPY.noTentCta}
          href={state.href}
        />
      ) : null}
      {state.kind === "no-plant" ? (
        <SetupCard
          testId="simple-home-no-plant"
          title={SIMPLE_HOME_COPY.noPlantTitle}
          body={SIMPLE_HOME_COPY.noPlantBody}
          cta={SIMPLE_HOME_COPY.noPlantCta}
          href={state.href}
        />
      ) : null}

      {state.kind === "choose-grow" ? (
        <section
          className="glass rounded-2xl p-5"
          aria-labelledby="simple-home-choose-grow-heading"
          data-testid="simple-home-choose-grow"
        >
          <h2 id="simple-home-choose-grow-heading" className="font-display text-lg font-semibold">
            {SIMPLE_HOME_COPY.chooseGrowTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{SIMPLE_HOME_COPY.chooseGrowBody}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.grows.map((grow) => (
              <li key={grow.id}>
                <Link
                  to={grow.href}
                  className="flex min-h-14 items-center justify-between rounded-xl border border-border/60 px-4 text-base font-medium hover:bg-secondary/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {grow.name}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.kind === "ready" ? (
        <div className="space-y-6" data-testid="dashboard-ready">
          <section aria-label={SIMPLE_HOME_COPY.addObservation} className="glass rounded-2xl p-5">
            <Button
              type="button"
              size="lg"
              className="w-full min-h-14 gap-2 text-base gradient-leaf text-primary-foreground"
              onClick={() => openQuickLog(null)}
              data-testid="simple-home-add-observation"
            >
              <NotebookPen className="h-5 w-5" aria-hidden="true" />
              {SIMPLE_HOME_COPY.addObservation}
            </Button>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {SIMPLE_HOME_COPY.addObservationHelp}
            </p>
          </section>

          <section aria-labelledby="simple-home-plants-heading">
            <h2
              id="simple-home-plants-heading"
              className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2"
            >
              {SIMPLE_HOME_COPY.plantsHeading}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2" data-testid="simple-home-plant-list">
              {state.plants.map((plant) => (
                <li
                  key={plant.id}
                  className="glass rounded-2xl p-4"
                  data-testid="simple-home-plant"
                  data-plant-id={plant.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={plant.href}
                        className="block truncate text-lg font-display font-semibold hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {plant.name}
                      </Link>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {plant.strain ? <span>{plant.strain} · </span> : null}
                        {plant.tentName && plant.tentHref ? (
                          <Link to={plant.tentHref} className="hover:underline">
                            {SIMPLE_HOME_COPY.inTent(plant.tentName)}
                          </Link>
                        ) : (
                          <span>{SIMPLE_HOME_COPY.tentUnknown}</span>
                        )}
                      </p>
                    </div>
                    <StageBadge stage={plant.stage} />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full min-h-11 gap-2"
                    onClick={() => openQuickLog(plant.quickLogTargetKey)}
                    aria-label={SIMPLE_HOME_COPY.addObservationFor(plant.name)}
                    data-testid="simple-home-plant-log"
                  >
                    <Sprout className="h-4 w-4" aria-hidden="true" />
                    {SIMPLE_HOME_COPY.addObservation}
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="simple-home-recent-heading" className="glass rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="simple-home-recent-heading" className="font-display font-semibold">
                {SIMPLE_HOME_COPY.recentHeading}
              </h2>
              <Link
                to={timelinePath(state.growId)}
                className="text-sm text-primary hover:underline"
                data-testid="simple-home-view-timeline"
              >
                {SIMPLE_HOME_COPY.viewTimeline} →
              </Link>
            </div>
            <RecentEntries
              growId={state.growId}
              recent={recent}
              onRetry={() => void reloadRecent()}
            />
          </section>
        </div>
      ) : null}

      <QuickLogV2Sheet
        open={sheetOpen}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next) setLaunchTargetKey(null);
        }}
        defaultTargetKey={launchTargetKey}
        defaultAction="note"
      />
    </div>
  );
}

function SetupCard({
  testId,
  title,
  body,
  cta,
  href,
}: {
  testId: string;
  title: string;
  body: string;
  cta: string;
  href: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center md:p-8"
      aria-label={title}
    >
      <h2 className="font-display text-xl font-semibold md:text-2xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
        {body}
      </p>
      <div className="mt-5 flex justify-center">
        <Button asChild size="lg" className="min-h-12 gradient-leaf text-primary-foreground">
          <Link to={href} data-testid={`${testId}-cta`}>
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function RecentEntries({
  growId,
  recent,
  onRetry,
}: {
  growId: string;
  recent: ReturnType<typeof useDashboardScopedData>["recent"];
  onRetry: () => void;
}) {
  if (recent.status === "idle" || recent.status === "loading") {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {SIMPLE_HOME_COPY.recentLoading}
      </p>
    );
  }
  if (recent.status === "unavailable") {
    return (
      <div role="alert" data-testid="simple-home-recent-unavailable" className="text-sm">
        <p className="text-muted-foreground">{SIMPLE_HOME_COPY.recentUnavailable}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {SIMPLE_HOME_COPY.retry}
        </Button>
      </div>
    );
  }
  const entries = selectSimpleHomeRecentEntries(recent.items, growId);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="simple-home-recent-empty">
        {SIMPLE_HOME_COPY.recentEmpty}
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid="simple-home-recent-list">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-xl border border-border/40 bg-secondary/20 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{entry.title}</span>
            <span className="text-xs text-muted-foreground">
              {Number.isFinite(Date.parse(entry.ts))
                ? formatDistanceToNow(new Date(entry.ts), { addSuffix: true })
                : ""}
            </span>
          </div>
          {entry.detail ? (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{entry.detail}</p>
          ) : null}
          <Link
            to={entry.href}
            className="mt-2 inline-flex min-h-9 items-center text-sm text-primary hover:underline"
            data-testid="simple-home-recent-open"
          >
            {SIMPLE_HOME_COPY.openEntry} →
          </Link>
        </li>
      ))}
    </ul>
  );
}
