import { useLayoutEffect, useRef } from "react";
import { adoptNotebookSessionOwner } from "@/lib/fieldNotebookSession";
import { useAuth } from "@/store/auth";

/**
 * The notebook owner follows the signed-in user. A null user on the first
 * paint does not clear a draft a test already adopted. After a real user
 * id has been seen, a later null user clears that account's notes.
 * AppShell passes clearOnUnmount because sign-out unmounts the shell before
 * the user id becomes null. The cleanup clears only while that sign-out is
 * pending. Leaving the shell for a public page keeps the note and its key.
 * A notebook surface does not clear on unmount.
 */
export function useNotebookSessionOwner(options?: { clearOnUnmount?: boolean }): void {
  const { user, isSignOutNavigationPending } = useAuth();
  const sawSignedInUser = useRef(false);
  const clearOnUnmount = options?.clearOnUnmount === true;

  useLayoutEffect(() => {
    const id = user?.id ?? null;
    if (id) {
      sawSignedInUser.current = true;
      adoptNotebookSessionOwner(id);
    } else if (sawSignedInUser.current) {
      adoptNotebookSessionOwner(null);
    }
    if (!clearOnUnmount) return;
    return () => {
      if (isSignOutNavigationPending?.() !== true) return;
      adoptNotebookSessionOwner(null);
    };
  }, [user?.id, clearOnUnmount, isSignOutNavigationPending]);
}
