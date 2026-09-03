import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@/lib/react-router-compat";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  computeAgreementGaps,
  type AcceptanceRow,
  type AgreementGap,
} from "@/lib/agreementConsent";
import {
  acceptancePayloadsForCurrentAgreements,
  recordOwnAgreementAcceptances,
  type AgreementAcceptanceRpcClient,
} from "@/lib/agreementAcceptanceService";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { AUTH_REVALIDATE_EVENT } from "@/hooks/useRequireAuth";

/**
 * Blocking re-consent modal. Renders when a signed-in user is missing any
 * current-version agreement acceptance. Cannot be dismissed except by
 * accepting or signing out — the whole point is to require agreement
 * before further use of the app.
 *
 * The VERIFY-ERROR block (the acceptance read failed) is different: it is
 * recoverable. Retry re-runs the read with the dialog kept open, Close and
 * Escape dismiss it without signing out, and a dismissal is re-checked on
 * the next page so it is never a permanent bypass. Nothing on that path
 * signs the grower out or claims consent; a read error still grants nothing.
 *
 * Routes where the modal is suppressed: /auth, /reset-password, /terms,
 * /privacy (so the user can read what they're accepting and so signed-out
 * flows are unaffected).
 */
const SUPPRESSED_PREFIXES = [
  "/auth",
  "/reset-password",
  "/terms",
  "/privacy",
  "/welcome",
  "/.lovable/",
];

export function AgreementReconsentGate() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const [gaps, setGaps] = useState<AgreementGap[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  /** Failed reads since the last successful one; shown from the second on. */
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  /** The grower closed the verify-error block on this page. */
  const [dismissed, setDismissed] = useState(false);
  const dismissedPathnameRef = useRef<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkboxRef = useRef<HTMLButtonElement | null>(null);

  const suppressed = SUPPRESSED_PREFIXES.some((p) => location.pathname.startsWith(p));
  // Key the check on the user ID, not the user object. The query depends only on
  // user.id; keying on the object would re-run the effect whenever the auth
  // context hands back a new object identity (a real risk that produces an
  // unbounded render/re-query loop — the same class of failure fixed in #188/#189).
  const userId = user?.id ?? null;

  useEffect(() => {
    if (loading || !userId || suppressed) {
      setGaps(null);
      setVerifyError(false);
      setVerifyAttempts(0);
      setDismissed(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    (async () => {
      const { data, error: err } = await supabase
        .from("user_agreement_acceptances")
        .select("agreement_type, version")
        .eq("user_id", userId);
      if (cancelled) return;
      if (err) {
        // Fail CLOSED for consent: a read error must never grant access as if
        // the user were current. Block with a retry / sign-out state instead of
        // treating an unverified user as consented.
        setVerifyError(true);
        setVerifyAttempts((n) => n + 1);
        setGaps(null);
        setChecking(false);
        return;
      }
      setVerifyError(false);
      setVerifyAttempts(0);
      setDismissed(false);
      setGaps(computeAgreementGaps((data ?? []) as AcceptanceRow[]));
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally NOT keyed on location.pathname: gap status does not change
    // on in-app navigation, and re-running per route caused the modal to flash
    // and re-query on every nav. `suppressed` already captures the only
    // pathname-derived value that matters. retryToken lets the error state retry.
    // Keyed on userId (a primitive), not the user object — see note above.
  }, [userId, loading, suppressed, retryToken]);

  // A dismissal is per page, not per session. When the grower moves on, run
  // the read again: if it now succeeds, any gap blocks as designed; if it
  // fails again, the (dismissible) block returns. This keeps a read error
  // from silently becoming an indefinite bypass of the consent check.
  const pathname = location.pathname;
  useEffect(() => {
    if (!dismissed) return;
    if (dismissedPathnameRef.current === pathname) return;
    setDismissed(false);
    setRetryToken((t) => t + 1);
  }, [dismissed, pathname]);

  function dismissVerifyError() {
    dismissedPathnameRef.current = pathname;
    setDismissed(true);
  }

  function retryVerify() {
    if (checking) return;
    // Let the protected layout re-validate the session too (getUser), then
    // re-run the acceptance read. The dialog stays mounted while it runs so
    // the grower sees "Retrying" instead of a flash of nothing.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT));
    }
    setRetryToken((t) => t + 1);
  }

  // The verify-error block stays open through a retry (verifyError is only
  // cleared by a successful read); the consent form waits for the read.
  const verifyErrorOpen = verifyError && !dismissed;
  const open =
    !!user &&
    !loading &&
    !suppressed &&
    (verifyErrorOpen || (!checking && (gaps?.length ?? 0) > 0));

  async function onAccept() {
    if (!user || submitting) return;
    if (!accept) {
      setError("Please tick the box to confirm you've read and agree to the current agreements.");
      // Move focus to the checkbox so keyboard users land on the control they must interact with.
      requestAnimationFrame(() => checkboxRef.current?.focus());
      return;
    }
    setError(null);
    setSubmitting(true);
    // Server sets user_id from auth.uid() — never send a client-chosen user_id.
    const payloads = acceptancePayloadsForCurrentAgreements(
      typeof navigator !== "undefined" ? navigator.userAgent : null,
    );
    const { error: err } = await recordOwnAgreementAcceptances(
      supabase as unknown as AgreementAcceptanceRpcClient,
      payloads,
    );
    setSubmitting(false);
    if (err) {
      setError("Couldn't record your acceptance. Please try again.");
      return;
    }
    setGaps([]);
    setAccept(false);
  }

  if (!open) return null;

  if (verifyErrorOpen) {
    // Fail-closed block: we could not read acceptance status, so we neither
    // grant access nor claim specific pending agreements. Unlike the consent
    // form below, this block is recoverable: Retry re-runs the read, and
    // Close / Escape dismiss it (re-checked on the next page). Neither path
    // signs the grower out; Sign out is an explicit choice and stays last.
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) dismissVerifyError();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          aria-labelledby="reconsent-verify-title"
          aria-describedby="reconsent-verify-description"
          data-testid="agreement-reconsent-verify-error"
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" aria-hidden />
              <DialogTitle id="reconsent-verify-title">
                Couldn&apos;t verify your agreements
              </DialogTitle>
            </div>
            <DialogDescription id="reconsent-verify-description">
              We couldn&apos;t confirm which agreements you&apos;ve accepted. Retry, or close this
              and carry on; we&apos;ll check again when you open another page.
            </DialogDescription>
          </DialogHeader>
          {verifyAttempts > 1 ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
              data-testid="agreement-reconsent-verify-attempts"
            >
              Still couldn&apos;t verify (attempt {verifyAttempts}).
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => void signOut()} disabled={checking}>
              Sign out
            </Button>
            <Button onClick={retryVerify} disabled={checking}>
              {checking ? "Retrying…" : "Retry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!gaps) return null;

  const anyPrior = gaps.some((g) => g.previouslyAcceptedVersion !== null);

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        data-testid="agreement-reconsent-gate"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" aria-hidden />
            <DialogTitle>{anyPrior ? "Updated agreements" : "Accept our agreements"}</DialogTitle>
          </div>
          <DialogDescription>
            {anyPrior
              ? "We've updated the agreements that govern your use of Verdant. Review what changed below, then accept the current versions to continue."
              : "Please review and accept the following to continue using Verdant."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 text-sm">
          {gaps.map(({ agreement, previouslyAcceptedVersion }) => (
            <li key={agreement.type} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{agreement.label}</p>
                <Link
                  to={agreement.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline underline-offset-2 hover:text-primary"
                >
                  Review {agreement.label}
                </Link>
              </div>
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                {previouslyAcceptedVersion ? (
                  <>
                    <dt className="text-muted-foreground">Your accepted version</dt>
                    <dd className="text-muted-foreground line-through">
                      {previouslyAcceptedVersion}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Your accepted version</dt>
                    <dd className="text-muted-foreground">None on file</dd>
                  </>
                )}
                <dt className="text-muted-foreground">New version</dt>
                <dd className="font-medium text-foreground">{agreement.version}</dd>
                <dt className="text-muted-foreground">Effective</dt>
                <dd className="text-foreground">{agreement.effectiveDate}</dd>
              </dl>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Full text:{" "}
          {CURRENT_AGREEMENT_LIST.map((a, i) => (
            <span key={a.type}>
              {i > 0 ? " · " : ""}
              <Link
                to={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {a.label}
              </Link>
            </span>
          ))}
        </p>

        <label htmlFor="reconsent-accept" className="flex items-start gap-2 text-sm">
          <Checkbox
            id="reconsent-accept"
            ref={checkboxRef}
            checked={accept}
            onCheckedChange={(v) => {
              const next = v === true;
              setAccept(next);
              if (next && error) setError(null);
            }}
            aria-describedby={error ? "reconsent-error" : undefined}
            aria-invalid={error ? true : undefined}
            aria-required
          />
          <span className="leading-snug text-muted-foreground">
            I have read and agree to the{" "}
            {CURRENT_AGREEMENT_LIST.map((a, i) => (
              <span key={a.type}>
                {i > 0 ? " and " : ""}
                <Link
                  to={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {a.label}
                </Link>
              </span>
            ))}
            .
          </span>
        </label>

        {error ? (
          <p
            id="reconsent-error"
            role="alert"
            aria-live="assertive"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => void signOut()} disabled={submitting}>
            Sign out
          </Button>
          <Button
            onClick={() => void onAccept()}
            disabled={submitting}
            aria-disabled={!accept || submitting}
          >
            {submitting ? "Saving…" : "Accept and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
