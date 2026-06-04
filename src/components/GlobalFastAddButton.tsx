/**
 * GlobalFastAddButton — presenter-only Fast Add menu for authenticated
 * surfaces. Surfaces 8 grower-friendly logging entry points and routes
 * them to the existing Quick Log / AI Doctor flows.
 *
 * Hard constraints:
 *  - Never inserts diary, sensor, alert, Action Queue, or device rows.
 *  - Diagnosis action navigates to the AI Doctor surface only; it does
 *    NOT call any model or edge function.
 *  - Without a selected plant/tent, all actions show a calm context copy.
 *  - All business rules live in `@/lib/fastAddActionRules`.
 */
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import {
  FAST_ADD_ACTIONS,
  FAST_ADD_NO_CONTEXT_COPY,
  deriveSelectionContextFromPathname,
  resolveFastAddIntent,
  type FastAddActionId,
  type FastAddSelectionContext,
} from "@/lib/fastAddActionRules";

export interface GlobalFastAddButtonProps {
  /**
   * Optional override for the current selection context. When omitted, the
   * component derives it from the current pathname (e.g. /plants/:id).
   */
  context?: FastAddSelectionContext | null;
  className?: string;
  /** Test seam: override navigate. */
  onNavigate?: (to: string) => void;
  /** Test seam: override window event dispatch. */
  onDispatchEvent?: (eventName: string, detail: unknown) => void;
}

export default function GlobalFastAddButton({
  context: contextProp,
  className,
  onNavigate,
  onDispatchEvent,
}: GlobalFastAddButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const context = useMemo<FastAddSelectionContext | null>(() => {
    if (contextProp !== undefined) return contextProp;
    return deriveSelectionContextFromPathname(location.pathname, null);
  }, [contextProp, location.pathname]);

  const handle = useCallback(
    (actionId: FastAddActionId) => {
      const intent = resolveFastAddIntent(actionId, context);
      if (intent.kind === "needs-context") {
        setNotice(intent.message);
        return;
      }
      setNotice(null);
      if (intent.kind === "navigate") {
        if (onNavigate) onNavigate(intent.to);
        else navigate(intent.to);
        setOpen(false);
        return;
      }
      // open-quicklog — dispatch the existing wired window event.
      if (onDispatchEvent) {
        onDispatchEvent(intent.eventName, intent.prefill);
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(intent.eventName, { detail: intent.prefill }),
        );
      }
      setOpen(false);
    },
    [context, navigate, onNavigate, onDispatchEvent],
  );

  return (
    <div
      data-testid="global-fast-add"
      data-has-context={context ? "true" : "false"}
      className={`relative ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setOpen((v) => !v);
        }}
        aria-label="Fast Add"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="global-fast-add-trigger"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/40 px-4 min-h-11 min-w-11 text-sm font-medium hover:bg-secondary/70 active:bg-secondary/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background touch-manipulation"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        Fast Add
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Fast Add actions"
          data-testid="global-fast-add-menu"
          className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-border/60 bg-popover shadow-elevated p-1.5 z-50"
        >
          <ul className="space-y-1">
            {FAST_ADD_ACTIONS.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handle(a.id)}
                  data-testid={`global-fast-add-action-${a.id}`}
                  data-action-id={a.id}
                  className="w-full text-left px-3 min-h-11 flex items-center rounded-md text-sm hover:bg-secondary/60 active:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>

          {notice ? (
            <div
              data-testid="global-fast-add-needs-context-wrap"
              className="px-3 py-3 mt-1 border-t border-border/40 space-y-3"
            >
              <p
                role="status"
                aria-live="polite"
                data-testid="global-fast-add-needs-context"
                className="text-sm text-amber-200 leading-snug"
              >
                {notice}
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "choose_plant", label: "Choose plant", to: "/plants" },
                  { id: "choose_tent", label: "Choose tent", to: "/tents" },
                ].map((cta) => (
                  <button
                    key={cta.id}
                    type="button"
                    data-testid={`global-fast-add-cta-${cta.id}`}
                    onClick={() => {
                      if (onNavigate) onNavigate(cta.to);
                      else navigate(cta.to);
                      setOpen(false);
                      setNotice(null);
                    }}
                    className="text-sm px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 active:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
                  >
                    {cta.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Static, hidden copy so the calm message ships in the DOM bundle
          even without state — useful for content audits. */}
      <span className="sr-only" data-testid="global-fast-add-needs-context-copy">
        {FAST_ADD_NO_CONTEXT_COPY}
      </span>
    </div>
  );
}
