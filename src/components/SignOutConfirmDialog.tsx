// SignOutConfirmDialog — confirmation gate before signing out.
//
// On confirm: runs performSafeSignOut(), which:
//  - calls supabase auth signOut (via useAuth)
//  - clears only auth-related transient UI state (allowlisted prefixes)
//  - never clears grow / diary / sensor / start-screen preference
//  - sanitizes the post-signout redirect (default /welcome)
//  - surfaces a friendly non-sensitive message on failure but still
//    redirects to a safe internal page
// On cancel: leaves the user in place.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/store/auth";
import {
  clearAuthTransientUiState,
  performSafeSignOut,
  SAFE_SIGN_OUT_REDIRECT,
  SIGN_OUT_LOADING_LABEL,
} from "@/lib/authSessionExitRules";

export default function SignOutConfirmDialog({
  trigger,
  redirectTo = SAFE_SIGN_OUT_REDIRECT,
}: {
  trigger: ReactNode;
  redirectTo?: string;
}) {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    if (busy) return; // prevent double-submit
    setBusy(true);
    setError(null);
    const result = await performSafeSignOut(
      {
        signOut,
        clearUiState: () => clearAuthTransientUiState(),
      },
      redirectTo,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
    }
    setOpen(false);
    nav(result.redirectTo, { replace: true });
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent data-testid="sign-out-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll be returned to the Verdant home page. Your grow data,
            logs, and start-screen preference stay safe — you can sign back in
            at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? SIGN_OUT_LOADING_LABEL : "Sign out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
