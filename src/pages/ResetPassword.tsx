import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Eye, EyeOff, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BrandLogo from "@/components/BrandLogo";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS_HELPER_COPY,
  RESET_FAILED_ERROR,
  getPasswordRequirementStatus,
} from "@/lib/passwordResetRules";

type Status = "checking" | "ready" | "no_session" | "saving" | "done";

export default function ResetPassword() {
  const nav = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const reqStatus = useMemo(
    () => getPasswordRequirementStatus(password, confirm),
    [password, confirm],
  );

  useEffect(() => {
    // Supabase's detectSessionInUrl parses the recovery hash automatically
    // on client load. We just check whether a session is present. We never
    // read, store, or log the hash/token/url directly.
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setStatus(data.session ? "ready" : "no_session");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Move focus to the page heading on mount so screen readers announce
  // context. After failed submit, focus jumps to the first invalid field.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setError(null);
    if (!reqStatus.allMet) {
      // Find the first unmet requirement to drive focus.
      const firstUnmet = reqStatus.requirements.find((r) => !r.met);
      setError(
        firstUnmet?.key === "matchesConfirm"
          ? "Passwords do not match."
          : `Password must meet all requirements (${firstUnmet?.label.toLowerCase() ?? "see list"}).`,
      );
      passwordRef.current?.focus();
      return;
    }
    setStatus("saving");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      // Do not surface raw auth errors — they can leak token/session state.
      setStatus("ready");
      setError(RESET_FAILED_ERROR);
      passwordRef.current?.focus();
      return;
    }
    setStatus("done");
    setTimeout(() => nav("/auth", { replace: true }), 800);
  }

  const submitDisabled = status === "saving" || !reqStatus.allMet;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size="lg" />
          <div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-3xl font-display font-bold focus-visible:outline-none"
            >
              Reset password
            </h1>
            <p className="text-sm text-muted-foreground">
              Choose a new password for your Verdant account.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          {status === "checking" ? (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              Checking reset link…
            </p>
          ) : status === "no_session" ? (
            <div className="grid gap-3" role="alert">
              <p className="text-sm">
                This reset link is missing or expired. Request a new one from the sign-in page.
              </p>
              <Link
                to="/auth"
                className="text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Back to sign in
              </Link>
            </div>
          ) : status === "done" ? (
            <div className="grid gap-3" role="status" aria-live="polite">
              <p className="text-sm">Password updated. Redirecting to sign in…</p>
              <Link
                to="/auth"
                className="text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="grid gap-3" aria-label="Reset password">
              <div>
                <Label htmlFor="reset-password">New password</Label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    ref={passwordRef}
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="password-requirements password-requirements-note"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    className="absolute inset-y-0 right-2 inline-flex items-center text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="reset-confirm">Confirm new password</Label>
                <Input
                  id="reset-confirm"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-describedby="password-requirements"
                  required
                />
              </div>

              <div
                id="password-requirements"
                aria-live="polite"
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <p
                  id="password-requirements-note"
                  className="text-xs text-muted-foreground mb-2"
                >
                  {PASSWORD_REQUIREMENTS_HELPER_COPY}
                </p>
                <ul className="grid gap-1 text-xs">
                  {reqStatus.requirements.map((req) => (
                    <li
                      key={req.key}
                      data-testid={`req-${req.key}`}
                      data-met={req.met ? "true" : "false"}
                      className={
                        req.met
                          ? "flex items-center gap-2 text-foreground"
                          : "flex items-center gap-2 text-muted-foreground"
                      }
                    >
                      {req.met ? (
                        <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                      ) : (
                        <Minus className="h-3.5 w-3.5" aria-hidden />
                      )}
                      <span>
                        <span className="sr-only">
                          {req.met ? "Requirement met: " : "Requirement not met: "}
                        </span>
                        {req.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                  {status === "ready" ? (
                    <>
                      {" "}
                      <Link to="/auth" className="underline underline-offset-4">
                        Request a new reset email
                      </Link>
                      .
                    </>
                  ) : null}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={submitDisabled}
                aria-busy={status === "saving"}
                className="gradient-leaf text-primary-foreground"
              >
                {status === "saving" ? "Updating password…" : "Update password"}
              </Button>
              <Link
                to="/auth"
                className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
