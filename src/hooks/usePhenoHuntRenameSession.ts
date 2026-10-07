/**
 * usePhenoHuntRenameSession — #551. Owns the rename editor's state (open,
 * draft, saving, failed) for PhenoHuntRenameControl.
 *
 * Call it from a component that stays mounted while the workspace reloads:
 * the control itself unmounts during `loading`, and a save that settles in
 * that window must still close the editor or show its failure against the
 * draft the grower submitted (#551 Codex P2s).
 *
 * Editor state is kept per hunt: the workspace route isn't keyed by hunt, so
 * the page can move between hunts, and each hunt keeps its own draft and
 * failure until the grower resolves it there. One save runs at a time across
 * the page; it settles into the session of the hunt that started it.
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
  readonly editing: boolean;
  readonly draft: string;
  readonly failed: boolean;
}

const IDLE: SessionState = { editing: false, draft: "", failed: false };

export function usePhenoHuntRenameSession(
  huntId: string | null | undefined,
  onRename: (name: string) => Promise<boolean>,
): PhenoHuntRenameSession {
  const scope = huntId ?? null;
  const [sessions, setSessions] = useState<Readonly<Record<string, SessionState>>>({});
  // The one save in flight, page-wide (the ref guards double submits).
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const current = (scope !== null && sessions[scope]) || IDLE;

  const update = useCallback(
    (key: string, change: (prev: SessionState) => SessionState) =>
      setSessions((prev) => ({ ...prev, [key]: change(prev[key] ?? IDLE) })),
    [],
  );

  const open = useCallback(
    (currentName: string) => {
      if (scope === null || savingRef.current) return;
      update(scope, () => ({ editing: true, draft: currentName, failed: false }));
    },
    [scope, update],
  );

  const cancel = useCallback(() => {
    if (scope === null || savingRef.current) return;
    update(scope, () => IDLE);
  }, [scope, update]);

  const setDraft = useCallback(
    (draft: string) => {
      if (scope === null) return;
      update(scope, (prev) => ({ ...prev, draft }));
    },
    [scope, update],
  );

  const save = useCallback(
    async (name: string) => {
      if (scope === null || savingRef.current) return;
      const owner = scope;
      savingRef.current = true;
      setSaving(true);
      update(owner, (prev) => ({ ...prev, failed: false }));
      let ok = false;
      try {
        ok = await onRename(name);
      } catch {
        ok = false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      // Settle into the session of the hunt that started the save.
      update(owner, (prev) => (ok ? IDLE : { ...prev, failed: true }));
    },
    [scope, onRename, update],
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
