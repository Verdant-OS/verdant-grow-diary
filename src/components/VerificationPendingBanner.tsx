// VerificationPendingBanner — shown on protected app shell for signed-in
// users whose email is not yet verified. Offers a resend button gated by
// the shared local cooldown helper.
//
// SAFETY:
//  - never logs email/token/session/password/hash
//  - never uses service_role or admin auth
//  - never reveals account existence beyond the current signed-in user
//  - presentation only; server is the source of truth
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  RESEND_VERIFICATION_GENERIC_SUCCESS,
  RESEND_VERIFICATION_GENERIC_FAILURE,
} from "@/lib/authErrorRules";
import {
  DEFAULT_VERIFICATION_COOLDOWN_MS,
  VERIFICATION_COOLDOWN_HINT,
  VERIFICATION_PENDING_BANNER_MESSAGE,
  canResendVerification,
  formatVerificationCooldown,
  verificationCooldownRemainingMs,
} from "@/lib/emailVerificationRules";

interface Props {
  email: string;
}

export default function VerificationPendingBanner({ email }: Props) {
  const [busy, setBusy] = useState(false);
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [noticeOk, setNoticeOk] = useState<string | null>(null);
  const [noticeErr, setNoticeErr] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastAttemptAt == null) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    tickRef.current = id;
    return () => window.clearInterval(id);
  }, [lastAttemptAt]);

  const cooldownActive = !canResendVerification(
    nowTick,
    lastAttemptAt,
    DEFAULT_VERIFICATION_COOLDOWN_MS,
  );
  const remainingMs = verificationCooldownRemainingMs(
    nowTick,
    lastAttemptAt,
    DEFAULT_VERIFICATION_COOLDOWN_MS,
  );
  const disabled = busy || cooldownActive || !email;
  const label = busy
    ? "Sending verification email…"
    : cooldownActive
      ? formatVerificationCooldown(remainingMs)
      : "Resend verification email";

  async function onResend() {
    if (busy || cooldownActive || !email) return;
    setBusy(true);
    setNoticeOk(null);
    setNoticeErr(null);
    try {
      const supaAny = supabase.auth as unknown as {
        resend?: (args: { type: "signup"; email: string }) => Promise<{ error: unknown }>;
      };
      if (typeof supaAny.resend === "function") {
        await supaAny.resend({ type: "signup", email });
      }
      setNoticeOk(RESEND_VERIFICATION_GENERIC_SUCCESS);
    } catch {
      setNoticeErr(RESEND_VERIFICATION_GENERIC_FAILURE);
    } finally {
      setBusy(false);
      const stamp = Date.now();
      setLastAttemptAt(stamp);
      setNowTick(stamp);
    }
  }

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="verification-pending-banner"
      className="glass rounded-2xl p-5 mb-5 border border-border/40"
    >
      <h2 className="font-display font-semibold mb-1">Verify your email</h2>
      <p className="text-sm text-muted-foreground mb-3">
        {VERIFICATION_PENDING_BANNER_MESSAGE}
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-busy={busy}
          onClick={onResend}
        >
          {label}
        </Button>
        {cooldownActive && !busy ? (
          <span className="text-xs text-muted-foreground">{VERIFICATION_COOLDOWN_HINT}</span>
        ) : null}
      </div>
      {noticeOk ? (
        <p role="status" className="text-xs text-muted-foreground mt-3">
          {noticeOk}
        </p>
      ) : null}
      {noticeErr ? (
        <p role="alert" className="text-xs text-destructive mt-3">
          {noticeErr}
        </p>
      ) : null}
    </section>
  );
}
