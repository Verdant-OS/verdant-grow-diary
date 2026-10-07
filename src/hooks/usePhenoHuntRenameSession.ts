/**
 * usePhenoHuntRenameSession — #551. Owns the rename editor's state (open,
 * draft, saving, failed) for PhenoHuntRenameControl.
 *
 * Call it from a component that stays mounted while the workspace reloads:
 * the control itself unmounts during `loading`, and a save that settles in
 * that window must still close the editor or show its failure against the
 * draft the grower submitted (#551 Codex P2s).
 *
 * The session is scoped to `huntId`: the workspace route isn't keyed by hunt,
 * so when the page moves to another hunt the editor starts idle there. One
 * save runs at a time across the page: while it is in flight no hunt can open
 * or save an editor, so the session that started it is still there when it
 * settles, even after the grower visits another hunt and comes back.
 */
import { useCallback, useRef, useState } from "react";

export interface PhenoHuntRenameSession {
  readonly editing: boolean;
  readonly draft: string;
  readonly saving: boolean;
  readonly failed: boolean;
  open: (currentName: string) => void;
  cancel: () => void;
  setDraft: (draft: string) => void;
  save: (name: string) => Promise<void>;
}

interface SessionState {
  readonly huntId: string | null;
  readonly editing: boolean;
  readonly draft: string;
  readonly failed: boolean;
}

const IDLE = { editing: false, draft: "", failed: false } as const;

export function usePhenoHuntRenameSession(
  huntId: string | null | undefined,
  onRename: (name: string) => Promise<boolean>,
): PhenoHuntRenameSession {
  const scope = huntId ?? null;
  const [state, setState] = useState<SessionState>({ huntId: scope, ...IDLE });
  // The one save in flight, page-wide (the ref guards double submits).
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const current = state.huntId === scope ? state : { huntId: scope, ...IDLE };

  const open = useCallback(
    (currentName: string) => {
      if (savingRef.current) return;
      setState({ huntId: scope, editing: true, draft: currentName, failed: false });
    },
    [scope],
  );

  const cancel = useCallback(() => {
    if (savingRef.current) return;
    setState({ huntId: scope, ...IDLE });
  }, [scope]);

  const setDraft = useCallback(
    (draft: string) => {
      setState((prev) =>
        prev.huntId === scope ? { ...prev, draft } : { huntId: scope, ...IDLE, draft },
      );
    },
    [scope],
  );

  const save = useCallback(
    async (name: string) => {
      if (scope === null || savingRef.current) return;
      const owner = scope;
      savingRef.current = true;
      setSaving(true);
      setState((prev) => (prev.huntId === owner ? { ...prev, failed: false } : prev));
      let ok = false;
      try {
        ok = await onRename(name);
      } catch {
        ok = false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      // Settle only into the session that started the save.
      setState((prev) => {
        if (prev.huntId !== owner) return prev;
        return ok ? { huntId: owner, ...IDLE } : { ...prev, failed: true };
      });
    },
    [scope, onRename],
  );

  return {
    editing: current.editing,
    draft: current.draft,
    saving,
    failed: current.failed,
    open,
    cancel,
    setDraft,
    save,
  };
}
