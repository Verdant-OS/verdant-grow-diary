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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@/lib/react-router-compat";
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
  SIGN_OUT_FAILURE_MESSAGE,
} from "@/lib/authSessionExitRules";
import { toast } from "sonner";

export default function SignOutConfirmDialog({
  trigger,
  redirectTo = SAFE_SIGN_OUT_REDIRECT,
}: {
  trigger: ReactNode;
  redirectTo?: string;
}) {
  const { signOut, beginSignOutNavigation } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function onConfirm() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const operation = beginSignOutNavigation?.();
    if (beginSignOutNavigation && !operation) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    const isCurrent = () => (operation ? operation.isCurrent() : mountedRef.current);
    try {
      const result = await performSafeSignOut(
        { signOut, clearUiState: () => clearAuthTransientUiState(), isCurrent },
        redirectTo,
      );
      if (!isCurrent()) return;
      if (result.ok === false) toast.error(result.message);
      // The provider keeps all entry surfaces pending until the router commits.
      // This handler intentionally survives the initiating dialog's unmount.
      await nav(result.redirectTo, { replace: true });
    } catch {
      if (isCurrent()) toast.error(SIGN_OUT_FAILURE_MESSAGE);
    } finally {
      operation?.finish();
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setOpen(false);
      }
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent data-testid="sign-out-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll be returned to the Verdant home page. Your grow data, logs, and start-screen
            preference stay safe — you can sign back in at any time.
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
