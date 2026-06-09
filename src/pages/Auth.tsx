import { useState, useEffect } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import BrandLogo from "@/components/BrandLogo";
import {
  validateResetEmail,
  buildResetRedirectUrl,
  GENERIC_RESET_REQUEST_SUCCESS,
  MIN_PASSWORD_LENGTH,
} from "@/lib/passwordResetRules";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (user) nav("/", { replace: true });
  }, [user, nav]);
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else nav("/", { replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Welcome to Verdant 🌱");
      nav("/", { replace: true });
    }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotError(null);
    const v = validateResetEmail(forgotEmail);
    if ("message" in v) {
      setForgotError(v.message);
      return;
    }
    setBusy(true);
    // Best-effort send. We do NOT branch on the result to avoid leaking
    // whether an account exists for this email. Errors are swallowed for
    // the user-facing copy and never logged with email/token/url.
    await supabase.auth.resetPasswordForEmail(v.email, {
      redirectTo: buildResetRedirectUrl(window.location.origin),
    });
    setBusy(false);
    setForgotSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-4">
          <Link
            to="/welcome"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
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
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-3 w-full mb-4">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
              <TabsTrigger value="forgot">Forgot password</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <p className="text-xs text-muted-foreground mb-3">
                Use the email and password you used to create your Verdant account.
              </p>
              <form onSubmit={signIn} className="grid gap-3" aria-label="Sign in">
                <div>
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                <Button disabled={busy} className="gradient-leaf text-primary-foreground">
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <p className="text-xs text-muted-foreground mb-3">
                New here? Create an account to start your grow diary.
              </p>
              <form onSubmit={signUp} className="grid gap-3" aria-label="Create account">
                <div>
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Minimum {MIN_PASSWORD_LENGTH} characters.
                  </p>
                </div>
                <Button disabled={busy} className="gradient-leaf text-primary-foreground">
                  Create account
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
                  <Button disabled={busy} className="gradient-leaf text-primary-foreground">
                    Send reset link
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
