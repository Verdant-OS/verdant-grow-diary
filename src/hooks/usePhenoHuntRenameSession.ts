/**
 * usePhenoHuntRenameSession — #551. Owns the rename editor's state (open,
 * draft, saving, failed) for PhenoHuntRenameControl.
 *
 * Call it from a component that stays mounted while the workspace reloads:
 * the control itself unmounts during `loading`, and a save that settles in
 * that window must still close the editor or show its failure against the
 * draft the grower submitted (#551 Codex P2s).
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

export function usePhenoHuntRenameSession(
  onRename: (name: string) => Promise<boolean>,
): PhenoHuntRenameSession {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  const open = useCallback((currentName: string) => {
    if (savingRef.current) return;
    setDraft(currentName);
    setFailed(false);
    setEditing(true);
  }, []);

  const cancel = useCallback(() => {
    if (savingRef.current) return;
    setEditing(false);
  }, []);

  const save = useCallback(
    async (name: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setFailed(false);
      let ok = false;
      try {
        ok = await onRename(name);
      } catch {
        ok = false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      if (ok) setEditing(false);
      else setFailed(true);
    },
    [onRename],
  );

  return { editing, draft, saving, failed, open, cancel, setDraft, save };
}
