/**
 * FirstRunChecklist — guided First-Run One-Tent Checklist presenter.
 *
 * Pure presenter. All activation logic lives in
 * `firstRunChecklistViewModel`. Reads/writes the dismiss preference
 * via a tiny local localStorage wrapper. No data fetching.
 */
import { useCallback, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, Sprout, X, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  buildFirstRunChecklistViewModel,
  FIRST_RUN_DISMISS_STORAGE_KEY,
  type FirstRunChecklistInput,
} from "@/lib/firstRunChecklistViewModel";

// --- local storage wrapper (namespaced, safe, reactive) ---------------------
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}
function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    s.getItem(FIRST_RUN_DISMISS_STORAGE_KEY);
    return s;
  } catch {
    return null;
  }
}
function readDismissed(): boolean {
  const s = safeStorage();
  if (!s) return false;
  try {
    return s.getItem(FIRST_RUN_DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeDismissed(v: boolean): void {
  const s = safeStorage();
  if (s) {
    try {
      if (v) s.setItem(FIRST_RUN_DISMISS_STORAGE_KEY, "1");
      else s.removeItem(FIRST_RUN_DISMISS_STORAGE_KEY);
    } catch {
      /* fail open */
    }
  }
  emit();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export interface FirstRunChecklistProps {
  growCount: number;
  tentCount: number;
  plantCount: number;
  quickLogCount?: number | null;
  sensorSnapshotCount?: number | null;
  className?: string;
}

export default function FirstRunChecklist(props: FirstRunChecklistProps) {
  const isDismissed = useSyncExternalStore(
    subscribe,
    readDismissed,
    () => false,
  );
  const dismiss = useCallback(() => writeDismissed(true), []);
  const restore = useCallback(() => writeDismissed(false), []);

  const input: FirstRunChecklistInput = {
    growCount: props.growCount,
    tentCount: props.tentCount,
    plantCount: props.plantCount,
    quickLogCount: props.quickLogCount,
    sensorSnapshotCount: props.sensorSnapshotCount,
    isDismissed,
  };
  const vm = buildFirstRunChecklistViewModel(input);

  if (vm.isFullyActivated) {
    return null;
  }

  if (!vm.isVisible) {
    if (!vm.showRestoreCta) return null;
    return (
      <div className={props.className}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="first-run-checklist-restore"
          onClick={restore}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="ml-1 text-xs">Show setup checklist</span>
        </Button>
      </div>
    );
  }

  return (
    <Card
      data-testid="first-run-checklist"
      className={`border-primary/30 ${props.className ?? ""}`}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sprout className="h-4 w-4 text-primary" />
              First-Run One-Tent Checklist
            </CardTitle>
            <p className="text-sm text-muted-foreground">{vm.intro}</p>
            <p className="text-xs text-muted-foreground">{vm.safetyNote}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="first-run-checklist-dismiss"
            aria-label="Hide first-run checklist"
            onClick={dismiss}
            className="shrink-0 -mr-2"
          >
            <X className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">Hide</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground mb-3">
          {vm.completeCount} of {vm.totalCount} complete
          {vm.requiredTotalCount > 0 && (
            <>
              {" · "}
              {vm.requiredCompleteCount} of {vm.requiredTotalCount} required
            </>
          )}
        </div>
        <ul className="space-y-2">
          {vm.steps.map((s) => (
            <li
              key={s.key}
              data-testid={`first-run-step-${s.key}`}
              data-complete={s.state === "complete" ? "true" : "false"}
              data-state={s.state}
              data-required={s.required ? "true" : "false"}
              className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/40 p-3"
            >
              {s.state === "complete" ? (
                <CheckCircle2
                  className="h-4 w-4 text-primary mt-0.5"
                  aria-label="complete"
                />
              ) : (
                <Circle
                  className="h-4 w-4 text-muted-foreground mt-0.5"
                  aria-label="incomplete"
                />
              )}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-semibold ${s.state === "complete" ? "text-muted-foreground line-through" : ""}`}
                >
                  {s.label}
                  {!s.required && s.state !== "complete" && (
                    <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {s.description}
                </div>
              </div>
              {s.state !== "complete" && (
                <Link to={s.href} className="shrink-0">
                  <Button size="sm" variant="outline">
                    {s.ctaLabel}
                  </Button>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
