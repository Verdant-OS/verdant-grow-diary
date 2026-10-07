/**
 * PhenoHuntRenameControl — #551. Lets the grower fix a hunt's name from the
 * workspace header (e.g. rows mangled by the pre-#482 prefill concat bug).
 *
 * Presenter only: validation lives in phenoHuntRenameRules; the parent owns
 * the write (`onRename` resolves true on a confirmed save). Hidden when the
 * grower cannot write — RLS and the Pro entitlement policy remain the real
 * boundary.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PHENO_HUNT_NAME_MAX_LENGTH,
  PHENO_HUNT_RENAME_COPY,
  phenoHuntRenameHint,
  validatePhenoHuntRename,
} from "@/lib/phenoHuntRenameRules";

export interface PhenoHuntRenameControlProps {
  currentName: string;
  canWrite: boolean;
  onRename: (name: string) => Promise<boolean>;
}

export default function PhenoHuntRenameControl({
  currentName,
  canWrite,
  onRename,
}: PhenoHuntRenameControlProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!canWrite) return null;

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="pheno-hunt-rename-open"
        onClick={() => {
          setDraft(currentName);
          setFailed(false);
          setEditing(true);
        }}
      >
        {PHENO_HUNT_RENAME_COPY.open}
      </Button>
    );
  }

  const result = validatePhenoHuntRename(draft, currentName);
  const hint = phenoHuntRenameHint(result);

  const save = async () => {
    if (!result.ok || saving) return;
    setSaving(true);
    setFailed(false);
    let ok = false;
    try {
      ok = await onRename(result.name);
    } catch {
      ok = false;
    } finally {
      setSaving(false);
    }
    if (ok) setEditing(false);
    else setFailed(true);
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      data-testid="pheno-hunt-rename-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="sr-only" htmlFor="pheno-hunt-rename-input">
        {PHENO_HUNT_RENAME_COPY.label}
      </label>
      <Input
        id="pheno-hunt-rename-input"
        data-testid="pheno-hunt-rename-input"
        className="h-8 max-w-sm"
        value={draft}
        maxLength={PHENO_HUNT_NAME_MAX_LENGTH + 20}
        onChange={(e) => setDraft(e.target.value)}
        disabled={saving}
        autoFocus
      />
      <Button
        type="submit"
        size="sm"
        disabled={!result.ok || saving}
        data-testid="pheno-hunt-rename-save"
      >
        {saving ? PHENO_HUNT_RENAME_COPY.saving : PHENO_HUNT_RENAME_COPY.save}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-testid="pheno-hunt-rename-cancel"
        disabled={saving}
        onClick={() => setEditing(false)}
      >
        {PHENO_HUNT_RENAME_COPY.cancel}
      </Button>
      {hint ? (
        <p className="w-full text-xs text-muted-foreground" data-testid="pheno-hunt-rename-hint">
          {hint}
        </p>
      ) : null}
      {failed ? (
        <p
          className="w-full text-xs text-destructive"
          role="alert"
          data-testid="pheno-hunt-rename-error"
        >
          {PHENO_HUNT_RENAME_COPY.saveFailed}
        </p>
      ) : null}
    </form>
  );
}
