/**
 * PublicQuickLogHandoffCard — calm authenticated resume surface for the
 * anonymous public Quick Log Starter draft ("Continue your Quick Log").
 *
 * Presenter + orchestration ONLY. All decisions live in
 * publicQuickLogHandoffRules / publicQuickLogHandoffViewModel.
 *
 * Hard lines:
 *  - Renders nothing unless a FRESH v1 draft exists on this device. The
 *    outer component mounts NO data hooks, so every host page (Onboarding,
 *    Dashboard) pays zero query cost — and needs no QueryClient — when
 *    there is no draft to resume (the overwhelmingly common case).
 *  - Zero writes: no Supabase imports, no inserts, no RPC. The only
 *    mutation it can perform is clearing the LOCAL draft, and only after
 *    the grower explicitly confirms "Discard draft".
 *  - "Review and save" hands the draft to the EXISTING Quick Log dialog via
 *    the established `verdant:open-quicklog` prefill event (in-memory
 *    detail — grower content never enters a URL). The dialog's own save
 *    button remains the only way anything reaches the diary.
 *  - "Not now" hides the card for THIS draft (local, per-draft, fail-open)
 *    and keeps the draft untouched, so onboarding continues normally.
 *  - Never auto-creates grows/tents/plants: with zero eligible plants it
 *    links to the existing setup flow and says the draft will wait.
 */
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { NotebookPen, ArrowRight, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import {
  clearPublicQuickLogStarterDraft,
  usePublicQuickLogStarterDraft,
} from "@/lib/publicQuickLogStarterDraftStore";
import type { PublicQuickLogStarterDraft } from "@/lib/publicQuickLogStarterRules";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  listEligibleHandoffPlants,
  mapDraftToQuickLogPrefill,
  matchHandoffPlant,
  resolvePublicQuickLogHandoffDraft,
} from "@/lib/publicQuickLogHandoffRules";
import {
  PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CANCEL_LABEL,
  PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CONFIRM_LABEL,
  PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CONFIRM_QUESTION,
  PUBLIC_QUICK_LOG_HANDOFF_DISCARD_LABEL,
  PUBLIC_QUICK_LOG_HANDOFF_DRAFT_STATUS_LINE,
  PUBLIC_QUICK_LOG_HANDOFF_NOT_NOW_LABEL,
  PUBLIC_QUICK_LOG_HANDOFF_PRIMARY_LABEL,
  PUBLIC_QUICK_LOG_HANDOFF_SETUP_LABEL,
  PUBLIC_QUICK_LOG_HANDOFF_TITLE,
  buildHandoffMatchHint,
  buildHandoffSummaryRows,
  buildHandoffTypeCaveat,
} from "@/lib/publicQuickLogHandoffViewModel";

// Same literal the onboarding checklist uses for its create_grow step
// (onboardingChecklistViewModel.ts) — the entry point of the existing
// Grow → Tent → Plant setup flow.
const GROW_SETUP_PATH = "/grows";

/**
 * Per-draft "Not now" preference. Local-only, fail-open (a storage error
 * simply keeps the card visible), and keyed by draft id so a NEW draft
 * shows the card again. Same inline try/catch posture as QuickLog's
 * lastTarget preference — never blocks or throws.
 */
const NOT_NOW_STORAGE_KEY = "verdant.quickLogHandoff.notNow.v1";

function readNotNowDraftId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(NOT_NOW_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberNotNow(draftId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOT_NOW_STORAGE_KEY, draftId);
  } catch {
    /* fail open — the card just stays visible next time */
  }
}

export interface PublicQuickLogHandoffCardProps {
  /** Test seam: stable "now" for the freshness decision. */
  now?: Date;
  className?: string;
}

export default function PublicQuickLogHandoffCard({
  now,
  className,
}: PublicQuickLogHandoffCardProps) {
  const storedDraft = usePublicQuickLogStarterDraft();
  const [notNowDraftId, setNotNowDraftId] = useState<string | null>(() =>
    readNotNowDraftId(),
  );

  const resolution = useMemo(
    () =>
      resolvePublicQuickLogHandoffDraft({
        draft: storedDraft,
        now: now ?? new Date(),
      }),
    [storedDraft, now],
  );
  const draft = resolution.draft;

  // Fail closed on every non-ready state (missing / malformed / unknown
  // version / stale / dismissed): render nothing, mount no data hooks,
  // touch nothing.
  if (!draft) return null;
  if (notNowDraftId === draft.id) return null;

  return (
    <HandoffCardInner
      draft={draft}
      className={className}
      onNotNow={() => {
        rememberNotNow(draft.id);
        setNotNowDraftId(draft.id);
      }}
    />
  );
}

function HandoffCardInner({
  draft,
  className,
  onNotNow,
}: {
  draft: PublicQuickLogStarterDraft;
  className?: string;
  onNotNow: () => void;
}) {
  const { data: plants = [] } = usePlants();
  const { data: tents = [] } = useTents();
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const match = useMemo(
    () =>
      matchHandoffPlant(
        draft.plantNickname,
        listEligibleHandoffPlants(plants, tents),
      ),
    [draft.plantNickname, plants, tents],
  );

  const summaryRows = buildHandoffSummaryRows(draft);
  const matchHint = buildHandoffMatchHint(match);
  const typeCaveat = buildHandoffTypeCaveat(draft.logType);
  const needsSetup = match.kind === "none";

  const handleReviewAndSave = () => {
    const prefill = mapDraftToQuickLogPrefill({ draft, match });
    // The global Quick Log dialog lives in AppShell; the dashboard route is
    // the canonical host (mirrors Onboarding's guided starter-setup flow).
    if (location.pathname !== "/") {
      navigate("/");
    }
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
        bubbles: true,
        cancelable: true,
        detail: prefill,
      }),
    );
  };

  const handleDiscardConfirmed = () => {
    clearPublicQuickLogStarterDraft();
    setConfirmingDiscard(false);
  };

  return (
    <section
      data-testid="public-quick-log-handoff-card"
      aria-labelledby="public-quick-log-handoff-title"
      className={`rounded-lg border border-primary/30 bg-primary/5 p-4 text-left space-y-3 ${className ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <NotebookPen className="h-4 w-4 text-primary mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <h2
            id="public-quick-log-handoff-title"
            className="text-sm font-semibold text-foreground"
          >
            {PUBLIC_QUICK_LOG_HANDOFF_TITLE}
          </h2>
          <p
            className="text-xs text-muted-foreground"
            data-testid="public-quick-log-handoff-status-line"
          >
            {PUBLIC_QUICK_LOG_HANDOFF_DRAFT_STATUS_LINE}
          </p>
        </div>
      </div>

      <dl className="space-y-1">
        {summaryRows.map((row) => (
          <div
            key={row.key}
            className="flex flex-wrap items-baseline gap-x-2"
            data-testid={`public-quick-log-handoff-row-${row.key}`}
          >
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd className="text-sm text-foreground break-words min-w-0 m-0">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <p
        className="text-xs text-muted-foreground"
        data-testid="public-quick-log-handoff-match-hint"
      >
        {matchHint}
      </p>
      {typeCaveat ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="public-quick-log-handoff-type-caveat"
        >
          {typeCaveat}
        </p>
      ) : null}

      {confirmingDiscard ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2"
          role="alertdialog"
          aria-labelledby="public-quick-log-handoff-discard-question"
        >
          <p
            id="public-quick-log-handoff-discard-question"
            className="text-xs text-foreground"
            data-testid="public-quick-log-handoff-discard-question"
          >
            {PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CONFIRM_QUESTION}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              data-testid="public-quick-log-handoff-discard-confirm"
              onClick={handleDiscardConfirmed}
            >
              {PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CONFIRM_LABEL}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="public-quick-log-handoff-discard-cancel"
              onClick={() => setConfirmingDiscard(false)}
            >
              {PUBLIC_QUICK_LOG_HANDOFF_DISCARD_CANCEL_LABEL}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {needsSetup ? (
            <Button
              asChild
              size="sm"
              className="gap-1 min-h-11"
              data-testid="public-quick-log-handoff-setup-link"
            >
              <Link to={GROW_SETUP_PATH}>
                <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
                {PUBLIC_QUICK_LOG_HANDOFF_SETUP_LABEL}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1 min-h-11"
              data-testid="public-quick-log-handoff-review-save"
              onClick={handleReviewAndSave}
            >
              {PUBLIC_QUICK_LOG_HANDOFF_PRIMARY_LABEL}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            data-testid="public-quick-log-handoff-not-now"
            onClick={onNotNow}
          >
            {PUBLIC_QUICK_LOG_HANDOFF_NOT_NOW_LABEL}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 text-muted-foreground"
            data-testid="public-quick-log-handoff-discard"
            onClick={() => setConfirmingDiscard(true)}
          >
            {PUBLIC_QUICK_LOG_HANDOFF_DISCARD_LABEL}
          </Button>
        </div>
      )}
    </section>
  );
}
