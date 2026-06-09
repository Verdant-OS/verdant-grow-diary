import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";
import { validateNewPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwordResetRules";

type Status = "checking" | "ready" | "no_session" | "saving" | "done";

export default function ResetPassword() {
  const nav = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validateNewPassword(password, confirm);
    if ("message" in v) {
      setError(v.message);
      return;
    }
    setStatus("saving");
    const { error: err } = await supabase.auth.updateUser({ password: v.password });
    if (err) {
      setStatus("ready");
      setError(err.message);
      return;
    }
    setStatus("done");
    toast.success("Password updated. You can sign in now.");
    setTimeout(() => nav("/auth", { replace: true }), 600);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size="lg" />
          <div>
            <h1 className="text-3xl font-display font-bold">Reset password</h1>
            <p className="text-sm text-muted-foreground">
              Choose a new password for your Verdant account.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          {status === "checking" ? (
            <p className="text-sm text-muted-foreground">Checking reset link…</p>
          ) : status === "no_session" ? (
            <div className="grid gap-3">
              <p className="text-sm">
                This reset link is missing or expired. Request a new one from the sign-in page.
              </p>
              <Link to="/auth" className="text-sm text-primary underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : status === "done" ? (
            <div className="grid gap-3" role="status" aria-live="polite">
              <p className="text-sm">Password updated. Redirecting to sign in…</p>
              <Link to="/auth" className="text-sm text-primary underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-3" aria-label="Reset password">
              <div>
                <Label htmlFor="reset-password">New password</Label>
                <div className="relative">
                  <Input
                    id="reset-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                <p className="text-xs text-muted-foreground mt-1">
                  Minimum {MIN_PASSWORD_LENGTH} characters.
                </p>
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
                  required
                />
              </div>
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={status === "saving"}
                className="gradient-leaf text-primary-foreground"
              >
                {status === "saving" ? "Saving…" : "Update password"}
              </Button>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
