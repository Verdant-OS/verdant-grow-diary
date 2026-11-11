import { useEffect, useRef } from "react";
import { adoptNotebookSessionOwner } from "@/lib/fieldNotebookSession";
import { useAuth } from "@/store/auth";

/**
 * The notebook owner follows the signed-in user. A null user on the first
 * paint does not clear a draft a test already adopted. After a real user
 * id has been seen, signing out clears that account's in-memory notes.
 */
export function useNotebookSessionOwner(): void {
  const { user } = useAuth();
  const sawSignedInUser = useRef(false);

  useEffect(() => {
    const id = user?.id ?? null;
    if (id) {
      sawSignedInUser.current = true;
      adoptNotebookSessionOwner(id);
      return;
    }
    if (sawSignedInUser.current) adoptNotebookSessionOwner(null);
  }, [user?.id]);
}
