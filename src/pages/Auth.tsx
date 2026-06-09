import { useState, useEffect, useRef, useMemo } from "react";
import { Navigate, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BrandLogo from "@/components/BrandLogo";
import {
  validateResetEmail,
  buildResetRedirectUrl,
  GENERIC_RESET_REQUEST_SUCCESS,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordResetRules";
import { sanitizeAuthError } from "@/lib/authErrorRules";
import { sanitizeAuthRedirect } from "@/lib/authRedirectRules";

type AuthMode = "signin" | "signup" | "forgot";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const [signInError, setSignInError] = useState<string | null>(null);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState<string | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  const signInEmailRef = useRef<HTMLInputElement>(null);
  const signUpEmailRef = useRef<HTMLInputElement>(null);
  const forgotEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) nav("/", { replace: true });
  }, [user, nav]);
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSignInError(null);
    setBusy(true);
    // We never log the raw Supabase error — it can leak rate-limit timing
    // or other account-state hints. Always show the friendly copy.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setSignInError(sanitizeAuthError("signIn", error));
      signInEmailRef.current?.focus();
      return;
    }
    nav("/", { replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setSignUpError(null);
    setSignUpSuccess(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setSignUpError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      setSignUpError(sanitizeAuthError("signUp", error));
      signUpEmailRef.current?.focus();
      return;
    }
    setSignUpSuccess("Welcome to Verdant. Check your inbox if confirmation is required.");
    nav("/", { replace: true });
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setForgotError(null);
    const v = validateResetEmail(forgotEmail);
    if ("message" in v) {
      setForgotError(v.message);
      forgotEmailRef.current?.focus();
      return;
    }
    setBusy(true);
    // Best-effort send. We do NOT branch on the success/failure shape in a
    // way that reveals account existence. Network/rate-limit errors get a
    // generic retry copy; success path uses GENERIC_RESET_REQUEST_SUCCESS.
    const { error } = await supabase.auth.resetPasswordForEmail(v.email, {
      redirectTo: buildResetRedirectUrl(window.location.origin),
    });
    setBusy(false);
    if (error) {
      setForgotError(sanitizeAuthError("forgotPassword", error));
      forgotEmailRef.current?.focus();
      return;
    }
    setForgotSent(true);
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4">
          <Link
            to="/welcome"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <BrandLogo size="lg" />
          <div>
            <h1 className="text-3xl font-display font-bold">Verdant</h1>
            <p className="text-sm text-muted-foreground">
              Plant memory. Sensor truth. Better decisions.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Your grow-room operating system for logs, sensor truth, cautious AI, and
          grower-approved actions.
        </p>

        <div className="glass rounded-2xl p-6">
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as AuthMode);
              setSignInError(null);
              setSignUpError(null);
              setForgotError(null);
            }}
          >
            <TabsList className="grid grid-cols-3 w-full mb-4">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
              <TabsTrigger value="forgot">Forgot password</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <p className="text-xs text-muted-foreground mb-3">
                Use the email and password you used to create your Verdant account.
              </p>
              <form onSubmit={signIn} noValidate className="grid gap-3" aria-label="Sign in">
                <div>
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    ref={signInEmailRef}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={signInError ? true : undefined}
                    aria-describedby={signInError ? "signin-error" : undefined}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={signInError ? true : undefined}
                      aria-describedby={signInError ? "signin-error" : undefined}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-2 inline-flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {signInError ? (
                  <p id="signin-error" role="alert" className="text-xs text-destructive">
                    {signInError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                  className="gradient-leaf text-primary-foreground"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <p className="text-xs text-muted-foreground mb-3">
                New here? Create an account to start your grow diary.
              </p>
              <form onSubmit={signUp} noValidate className="grid gap-3" aria-label="Create account">
                <div>
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    ref={signUpEmailRef}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={signUpError ? true : undefined}
                    aria-describedby={signUpError ? "signup-error" : undefined}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="signup-password-hint"
                    required
                  />
                  <p id="signup-password-hint" className="text-xs text-muted-foreground mt-1">
                    Minimum {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>
                {signUpError ? (
                  <p id="signup-error" role="alert" className="text-xs text-destructive">
                    {signUpError}
                  </p>
                ) : null}
                {signUpSuccess ? (
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                    {signUpSuccess}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                  className="gradient-leaf text-primary-foreground"
                >
                  {busy ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="forgot">
              <p className="text-xs text-muted-foreground mb-3">
                Forgot your password? We'll email you a secure reset link.
              </p>
              {forgotSent ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="text-sm text-muted-foreground"
                >
                  {GENERIC_RESET_REQUEST_SUCCESS}
                </div>
              ) : (
                <form onSubmit={requestReset} noValidate className="grid gap-3" aria-label="Forgot password">
                  <div>
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      ref={forgotEmailRef}
                      type="email"
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        if (forgotError) setForgotError(null);
                      }}
                      aria-invalid={forgotError ? true : undefined}
                      aria-describedby={forgotError ? "forgot-email-error" : undefined}
                    />
                    {forgotError ? (
                      <p
                        id="forgot-email-error"
                        role="alert"
                        className="text-xs text-destructive mt-1"
                      >
                        {forgotError}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    aria-busy={busy}
                    className="gradient-leaf text-primary-foreground"
                  >
                    {busy ? "Sending reset link…" : "Send reset link"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
