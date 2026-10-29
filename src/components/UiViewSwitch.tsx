import { useState } from "react";
import { LayoutDashboard, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  UI_VIEW_COPY,
  uiViewSaveStatusCopy,
  type UiView,
  type UiViewSaveStatus,
} from "@/lib/uiViewPreferenceRules";

interface Props {
  /** The view currently shown. */
  current: UiView;
  /** Writes the explicit choice to the account; resolves true when confirmed. */
  onChoose: (view: UiView) => Promise<boolean>;
  save: UiViewSaveStatus;
  /** True when the account read failed and the shown view is a device fallback. */
  accountUnavailable?: boolean;
  /** "toggle" renders one button to the other view; "cards" renders both choices. */
  layout?: "toggle" | "cards";
  className?: string;
}

/**
 * The Simple ⇄ Advanced switch. Presenter only: it shows the account write's
 * real outcome (saving, saved, failed) and never claims a save it cannot confirm.
 */
export default function UiViewSwitch({
  current,
  onChoose,
  save,
  accountUnavailable = false,
  layout = "toggle",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const other: UiView = current === "simple" ? "advanced" : "simple";

  async function choose(view: UiView) {
    if (busy) return;
    setBusy(true);
    try {
      await onChoose(view);
    } finally {
      setBusy(false);
    }
  }

  const statusCopy = uiViewSaveStatusCopy(save);
  const statusRole = save.kind === "failed" ? "alert" : "status";

  return (
    <div className={className} data-testid="ui-view-switch" data-current-view={current}>
      {layout === "toggle" ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2"
          disabled={busy}
          onClick={() => void choose(other)}
          data-testid={`ui-view-switch-to-${other}`}
        >
          {other === "advanced" ? (
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Leaf className="h-4 w-4" aria-hidden="true" />
          )}
          {other === "advanced" ? UI_VIEW_COPY.switchToAdvanced : UI_VIEW_COPY.switchToSimple}
        </Button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Home view">
          {(["simple", "advanced"] as const).map((view) => {
            const selected = view === current;
            return (
              <button
                key={view}
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => void choose(view)}
                data-testid={`ui-view-choice-${view}`}
                className={`min-h-16 rounded-xl border p-3 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:bg-secondary/40"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {view === "simple" ? (
                    <Leaf className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <LayoutDashboard className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                  {view === "simple" ? UI_VIEW_COPY.simpleLabel : UI_VIEW_COPY.advancedLabel}
                  {selected ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                      Current
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {view === "simple"
                    ? UI_VIEW_COPY.simpleDescription
                    : UI_VIEW_COPY.advancedDescription}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {statusCopy ? (
        <p
          role={statusRole}
          aria-live="polite"
          data-testid="ui-view-switch-status"
          className={`mt-2 text-xs ${save.kind === "failed" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {statusCopy}
        </p>
      ) : accountUnavailable ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="ui-view-switch-account-unavailable"
          className="mt-2 text-xs text-muted-foreground"
        >
          {UI_VIEW_COPY.accountUnavailable}
        </p>
      ) : null}
    </div>
  );
}
