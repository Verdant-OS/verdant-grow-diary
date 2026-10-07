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
 * so when the page moves to another hunt the editor starts idle there, and a
 * save still in flight for the previous hunt settles only into that hunt's
 * (now hidden) session.
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
  // Hunts whose save is in flight (the ref guards double submits).
  const [savingHuntIds, setSavingHuntIds] = useState<ReadonlySet<string>>(() => new Set());
  const savingRef = useRef(new Set<string>());

  const current = state.huntId === scope ? state : { huntId: scope, ...IDLE };
  const saving = scope !== null && savingHuntIds.has(scope);

  const open = useCallback(
    (currentName: string) => {
      if (scope !== null && savingRef.current.has(scope)) return;
      setState({ huntId: scope, editing: true, draft: currentName, failed: false });
    },
    [scope],
  );

  const cancel = useCallback(() => {
    if (scope !== null && savingRef.current.has(scope)) return;
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
      if (scope === null || savingRef.current.has(scope)) return;
      const owner = scope;
      savingRef.current.add(owner);
      setSavingHuntIds(new Set(savingRef.current));
      setState((prev) => (prev.huntId === owner ? { ...prev, failed: false } : prev));
      let ok = false;
      try {
        ok = await onRename(name);
      } catch {
        ok = false;
      } finally {
        savingRef.current.delete(owner);
        setSavingHuntIds(new Set(savingRef.current));
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
