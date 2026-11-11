import { useLayoutEffect, useRef } from "react";
import { adoptNotebookSessionOwner } from "@/lib/fieldNotebookSession";
import { useAuth } from "@/store/auth";

/**
 * The notebook owner follows the signed-in user. A null user on the first
 * paint does not clear a draft a test already adopted. After a real user
 * id has been seen, a later null user clears that account's notes. A surface
 * that is not mounted does not see that change. AppShell calls this on every
 * signed-in page, above the return that unmounts the notebook.
 */
export function useNotebookSessionOwner(): void {
  const { user } = useAuth();
  const sawSignedInUser = useRef(false);

  useLayoutEffect(() => {
    const id = user?.id ?? null;
    if (id) {
      sawSignedInUser.current = true;
      adoptNotebookSessionOwner(id);
      return;
    }
    if (sawSignedInUser.current) adoptNotebookSessionOwner(null);
  }, [user?.id]);
}
