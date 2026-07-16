/**
 * accountDeletion — client helper for the `delete-account` edge function.
 *
 * The edge function requires `{ confirm: "DELETE" }` and re-verifies the
 * caller JWT before any destructive write. This helper enforces the same
 * literal so a typo cannot silently fail closed.
 *
 * On success, the caller's session is invalidated server-side; we also
 * call supabase.auth.signOut locally so the SPA drops the stale session.
 */
import { supabase } from "@/integrations/supabase/client";

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

export const DELETE_ACCOUNT_GENERIC_FAILURE =
  "We couldn't delete your account right now. Please try again or contact support.";

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
}

export async function requestAccountDeletion(
  typedConfirmation: string,
): Promise<DeleteAccountResult> {
  if (typedConfirmation !== DELETE_ACCOUNT_CONFIRMATION) {
    return { ok: false, error: `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm.` };
  }
  try {
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      "delete-account",
      { body: { confirm: DELETE_ACCOUNT_CONFIRMATION } },
    );
    if (error || !data?.ok) {
      return { ok: false, error: DELETE_ACCOUNT_GENERIC_FAILURE };
    }
    // Local sign-out. Server has already revoked; this drops the SPA cache.
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch {
    return { ok: false, error: DELETE_ACCOUNT_GENERIC_FAILURE };
  }
}
