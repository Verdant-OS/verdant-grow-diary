import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAcceptanceRows,
  computeAgreementGaps,
  type AcceptanceRow,
  type AgreementGap,
} from "@/lib/agreementConsent";
import { CURRENT_AGREEMENT_LIST } from "@/constants/agreements";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

/**
 * Blocking re-consent modal. Renders when a signed-in user is missing any
 * current-version agreement acceptance. Cannot be dismissed except by
 * accepting or signing out — the whole point is to require agreement
 * before further use of the app.
 *
 * Routes where the modal is suppressed: /auth, /reset-password, /terms,
 * /privacy (so the user can read what they're accepting and so signed-out
 * flows are unaffected).
 */
const SUPPRESSED_PREFIXES = ["/auth", "/reset-password", "/terms", "/privacy", "/.lovable/"];

export function AgreementReconsentGate() {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const [gaps, setGaps] = useState<AgreementGap[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkboxRef = useRef<HTMLButtonElement | null>(null);

  const suppressed = SUPPRESSED_PREFIXES.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (loading || !user || suppressed) {
      setGaps(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    (async () => {
      const { data, error: err } = await supabase
        .from("user_agreement_acceptances")
        .select("agreement_type, version")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (err) {
        // Fail-open on read errors: don't lock the user out due to a
        // transient network blip. A next successful read will re-enforce.
        setGaps([]);
        setChecking(false);
        return;
      }
      setGaps(computeAgreementGaps((data ?? []) as AcceptanceRow[]));
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, suppressed, location.pathname]);

  const open = !!user && !loading && !suppressed && !checking && (gaps?.length ?? 0) > 0;

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
    const rows = buildAcceptanceRows(user.id).map((r) => ({
      ...r,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }));
    const { error: err } = await supabase
      .from("user_agreement_acceptances")
      .upsert(rows, { onConflict: "user_id,agreement_type,version" });
    setSubmitting(false);
    if (err) {
      setError("Couldn't record your acceptance. Please try again.");
      return;
    }
    setGaps([]);
    setAccept(false);
  }

  if (!open || !gaps) return null;

  const anyPrior = gaps.some((g) => g.previouslyAcceptedVersion !== null);

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
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

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            id="reconsent-accept"
            checked={accept}
            onCheckedChange={(v) => setAccept(v === true)}
            aria-describedby={error ? "reconsent-error" : undefined}
          />
          <span className="leading-snug text-muted-foreground">
            I have read and agree to the {CURRENT_AGREEMENT_LIST.map((a, i) => (
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
          <p id="reconsent-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => void signOut()} disabled={submitting}>
            Sign out
          </Button>
          <Button onClick={() => void onAccept()} disabled={!accept || submitting}>
            {submitting ? "Saving…" : "Accept and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
