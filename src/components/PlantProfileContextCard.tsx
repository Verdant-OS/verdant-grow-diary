/**
 * PlantProfileContextCard — presenter card surfacing which plant profile
 * fields are known vs missing for AI Doctor context, with an optional
 * inline edit flow for `medium` and `pot_size`.
 *
 * Strictly UI:
 *  - No backend writes, fetch, storage, or AI imports here.
 *  - Persistence is delegated to the injected `onSave` callback so the
 *    card stays presenter-only and the existing static safety scan
 *    (forbidding supabase/.update/.insert/fetch/etc.) continues to pass.
 *  - The card only ever surfaces `medium` and `pot_size` for editing —
 *    other plant fields are not editable through this surface.
 */
import { useState } from "react";
import { Sprout } from "lucide-react";
import {
  buildPlantProfileContextViewModel,
  PLANT_PROFILE_CONTEXT_COPY,
  type PlantProfileContextInput,
} from "@/lib/plantProfileContextViewModel";

export interface PlantProfileContextEditableDraft {
  medium: string | null;
  potSize: string | null;
}

export interface PlantProfileContextCardProps extends PlantProfileContextInput {
  className?: string;
  /**
   * Persistence callback. When provided, the card switches its
   * "coming soon" buttons for a real inline edit flow.
   * The callback receives ONLY the two editable fields.
   */
  onSave?: (draft: PlantProfileContextEditableDraft) => Promise<void>;
}

const EDIT_COPY = Object.freeze({
  editMedium: "Add medium",
  editPotSize: "Add pot size",
  editMediumKnown: "Edit medium",
  editPotSizeKnown: "Edit pot size",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  mediumPlaceholder: "e.g. coco, soil, hydro",
  potSizePlaceholder: "e.g. 11 L, 3 gal",
  mediumLabel: "Medium",
  potSizeLabel: "Pot size",
  genericError: "Couldn't save. Try again.",
});

export default function PlantProfileContextCard(
  props: PlantProfileContextCardProps,
) {
  const vm = buildPlantProfileContextViewModel(props);
  const editable = typeof props.onSave === "function";

  const [editing, setEditing] = useState(false);
  const [mediumDraft, setMediumDraft] = useState<string>(vm.medium.value ?? "");
  const [potSizeDraft, setPotSizeDraft] = useState<string>(vm.potSize.value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setMediumDraft(vm.medium.value ?? "");
    setPotSizeDraft(vm.potSize.value ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (saving) return;
    setEditing(false);
    setError(null);
    // Restore drafts to current known values so reopening shows current state.
    setMediumDraft(vm.medium.value ?? "");
    setPotSizeDraft(vm.potSize.value ?? "");
  }

  async function handleSave() {
    if (!props.onSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await props.onSave({
        medium: mediumDraft,
        potSize: potSizeDraft,
      });
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : EDIT_COPY.genericError,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      data-testid="plant-profile-context-card"
      className={`glass rounded-2xl p-4 my-3 space-y-3 ${props.className ?? ""}`}
      aria-label={vm.title}
    >
      <header className="flex items-start gap-2">
        <Sprout className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">{vm.title}</h3>
          <p className="text-xs text-muted-foreground">{vm.description}</p>
        </div>
      </header>

      <ul className="text-xs space-y-1.5">
        <li
          data-testid="plant-profile-context-field-stage"
          data-known={vm.stage.known ? "true" : "false"}
        >
          {vm.stage.label}
        </li>
        <li
          data-testid="plant-profile-context-field-strain"
          data-known={vm.strain.known ? "true" : "false"}
        >
          {vm.strain.label}
        </li>
        <li
          data-testid="plant-profile-context-field-medium"
          data-known={vm.medium.known ? "true" : "false"}
          className={vm.medium.known ? "" : "text-muted-foreground"}
        >
          {vm.medium.label}
        </li>
        <li
          data-testid="plant-profile-context-field-pot-size"
          data-known={vm.potSize.known ? "true" : "false"}
          className={vm.potSize.known ? "" : "text-muted-foreground"}
        >
          {vm.potSize.label}
        </li>
      </ul>

      {editable && editing ? (
        <form
          data-testid="plant-profile-context-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="space-y-2"
        >
          <label className="block text-xs space-y-1">
            <span className="text-muted-foreground">{EDIT_COPY.mediumLabel}</span>
            <input
              type="text"
              data-testid="plant-profile-context-input-medium"
              value={mediumDraft}
              onChange={(e) => setMediumDraft(e.target.value)}
              placeholder={EDIT_COPY.mediumPlaceholder}
              disabled={saving}
              className="w-full text-xs px-2 py-1 rounded-md border border-border bg-background"
            />
          </label>
          <label className="block text-xs space-y-1">
            <span className="text-muted-foreground">{EDIT_COPY.potSizeLabel}</span>
            <input
              type="text"
              data-testid="plant-profile-context-input-pot-size"
              value={potSizeDraft}
              onChange={(e) => setPotSizeDraft(e.target.value)}
              placeholder={EDIT_COPY.potSizePlaceholder}
              disabled={saving}
              className="w-full text-xs px-2 py-1 rounded-md border border-border bg-background"
            />
          </label>
          {error ? (
            <p
              role="alert"
              data-testid="plant-profile-context-edit-error"
              className="text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              data-testid="plant-profile-context-save"
              disabled={saving}
              aria-busy={saving ? "true" : "false"}
              className="text-xs px-2 py-1 rounded-md border border-border bg-primary text-primary-foreground disabled:opacity-60"
            >
              {saving ? EDIT_COPY.saving : EDIT_COPY.save}
            </button>
            <button
              type="button"
              data-testid="plant-profile-context-cancel"
              onClick={cancelEdit}
              disabled={saving}
              className="text-xs px-2 py-1 rounded-md border border-border bg-muted/40 disabled:opacity-60"
            >
              {EDIT_COPY.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="plant-profile-context-add-medium"
            disabled={!editable}
            aria-disabled={!editable}
            onClick={editable ? openEdit : undefined}
            className={
              editable
                ? "text-xs px-2 py-1 rounded-md border border-border bg-background"
                : "text-xs px-2 py-1 rounded-md border border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
            }
          >
            {editable
              ? vm.medium.known
                ? EDIT_COPY.editMediumKnown
                : EDIT_COPY.editMedium
              : PLANT_PROFILE_CONTEXT_COPY.addMedium}
          </button>
          <button
            type="button"
            data-testid="plant-profile-context-add-pot-size"
            disabled={!editable}
            aria-disabled={!editable}
            onClick={editable ? openEdit : undefined}
            className={
              editable
                ? "text-xs px-2 py-1 rounded-md border border-border bg-background"
                : "text-xs px-2 py-1 rounded-md border border-border bg-muted/40 text-muted-foreground cursor-not-allowed"
            }
          >
            {editable
              ? vm.potSize.known
                ? EDIT_COPY.editPotSizeKnown
                : EDIT_COPY.editPotSize
              : PLANT_PROFILE_CONTEXT_COPY.addPotSize}
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{vm.rationale}</p>
    </section>
  );
}
