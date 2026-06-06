// AuthStatusIndicator — minimal "loading / signed in / signed out" pill.
// Does NOT render email, user id, tokens, or any other identifier.
// See docs/auth-security.md.
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

export default function AuthStatusIndicator({ className }: { className?: string }) {
  const { user, loading } = useAuth();
  const label = loading ? "Checking…" : user ? "Signed in" : "Signed out";
  const tone = loading
    ? "bg-muted text-muted-foreground"
    : user
      ? "bg-primary/10 text-primary"
      : "bg-destructive/10 text-destructive";
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="auth-status-indicator"
      data-auth-state={loading ? "loading" : user ? "signed-in" : "signed-out"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-xs font-medium",
        tone,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          loading ? "bg-muted-foreground" : user ? "bg-primary" : "bg-destructive",
        )}
      />
      {label}
    </span>
  );
}
