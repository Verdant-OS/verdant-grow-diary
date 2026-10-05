/**
 * PhenoDocumentationSections — default documentation sections for
 * PHENOHUNT candidate / breeding program records.
 *
 * Presenter-only. Persists to localStorage keyed by (recordType, recordId)
 * so saved values survive across sessions without touching schema or RLS.
 * Defaults populate empty fields but never overwrite anything already saved.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/store/auth";
import {
  PHENO_DOCUMENTATION_DEFAULTS,
  mergeDocumentationValues,
  type PhenoDocumentationValues,
} from "@/constants/phenoDocumentationDefaults";
import {
  PHENO_DOCS_RESTORED_EVENT,
  canSavePhenoDocOverStored,
  phenoDocChangeAffectsRecord,
  phenoDocStorageKey,
  type PhenoDocRecordType,
  type PhenoDocsRestoredDetail,
} from "@/lib/phenoDocumentationBackupRules";

// Storage keys are USER-scoped when signed in (see phenoDocStorageKey): the
// old device-scoped key let another signed-in account on the same device see
// the previous grower's values; legacy device-scoped data is never read under
// a user id.
export type { PhenoDocRecordType };
type DeviceSaveStatus = "idle" | "saved" | "failed" | "stale" | "conflict";

export interface PhenoDocDiaryOption {
  readonly id: string;
  readonly label: string;
}

interface Props {
  recordId: string;
  recordType: PhenoDocRecordType;
  /** Optional label shown above the sections. */
  title?: string;
  /** If provided, each section shows an optional diary reference selector. */
  diaryOptions?: readonly PhenoDocDiaryOption[];
  /** Storage adapter override (tests). Defaults to window.localStorage. */
  storage?: Pick<Storage, "getItem" | "setItem">;
  /**
   * When false, sections start collapsed, their fields mount only once a
   * section is opened, and saved values hydrate lazily on first open. Set by
   * surfaces that render one instance PER CANDIDATE (28 always-mounted fields
   * and a synchronous storage read per instance don't scale to hundreds of
   * cards). Defaults to true — the standalone all-open behavior.
   */
  defaultOpen?: boolean;
}

/** The stored JSON string for one record, or null (missing / unreadable). */
function readRaw(storage: Pick<Storage, "getItem" | "setItem"> | null, key: string): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function parseSaved(raw: string | null): PhenoDocumentationValues | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PhenoDocumentationValues;
  } catch {
    return null;
  }
}

function loadSaved(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  recordType: PhenoDocRecordType,
  recordId: string,
  userId: string | null,
): PhenoDocumentationValues | null {
  return parseSaved(readRaw(storage, phenoDocStorageKey(recordType, recordId, userId)));
}

function resolveDeviceStorage(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): Pick<Storage, "getItem" | "setItem"> | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function PhenoDocumentationSections({
  recordId,
  recordType,
  title = "Documentation",
  diaryOptions,
  storage,
  defaultOpen = true,
}: Props) {
  const store = useMemo(() => resolveDeviceStorage(storage), [storage]);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const recordKey = phenoDocStorageKey(recordType, recordId, userId);

  // The stored string the open form hydrated from (undefined = not hydrated).
  // Save refuses to write when storage no longer holds it: a restore or
  // another tab replaced the record, and writing would silently revert it.
  const [hydratedRaw, setHydratedRaw] = useState<string | null | undefined>(() =>
    defaultOpen ? readRaw(store, recordKey) : undefined,
  );

  // Lazy hydration: null = storage not read yet (collapsed mode only). The
  // eager path preserves the original mount-time read for defaultOpen users.
  const [values, setValues] = useState<PhenoDocumentationValues | null>(() =>
    defaultOpen ? mergeDocumentationValues(loadSaved(store, recordType, recordId, userId)) : null,
  );
  const [saveStatus, setSaveStatus] = useState<DeviceSaveStatus>("idle");
  // True while the form holds typing that has not been saved. A record change
  // from a restore or another tab must not replace that typing silently.
  const dirtyRef = useRef(false);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set());

  // Re-hydrate if the record identity changes (e.g. switching candidates).
  useEffect(() => {
    const raw = defaultOpen ? readRaw(store, recordKey) : undefined;
    setHydratedRaw(raw);
    setValues(defaultOpen ? mergeDocumentationValues(parseSaved(raw ?? null)) : null);
    setOpenSections(new Set());
    setSaveStatus("idle");
    dirtyRef.current = false;
  }, [store, recordKey, defaultOpen]);

  // A restore (same tab) or a write from another tab replaced this record:
  // show the stored values instead of keeping pre-restore ones on screen. If
  // the form has unsaved typing, keep it, warn, and block Save until the
  // grower discards it and loads the stored record.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = (changedKeys: ReadonlyArray<string> | null) => {
      if (!phenoDocChangeAffectsRecord(changedKeys, recordKey)) return;
      if (dirtyRef.current) {
        setSaveStatus("conflict");
        return;
      }
      const raw = readRaw(store, recordKey);
      setValues((prev) =>
        prev === null && !defaultOpen ? null : mergeDocumentationValues(parseSaved(raw)),
      );
      setHydratedRaw((prev) => (prev === undefined && !defaultOpen ? undefined : raw));
      setSaveStatus("idle");
    };
    const onRestored = (e: Event) =>
      refresh((e as CustomEvent<PhenoDocsRestoredDetail | undefined>).detail?.keys ?? null);
    const onStorage = (e: StorageEvent) => refresh(e.key === null ? null : [e.key]);
    window.addEventListener(PHENO_DOCS_RESTORED_EVENT, onRestored);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PHENO_DOCS_RESTORED_EVENT, onRestored);
      window.removeEventListener("storage", onStorage);
    };
  }, [store, recordKey, defaultOpen]);

  /** Hydrate from storage before the first edit (collapsed mode). */
  function hydrateForEdit() {
    if (values !== null) return;
    const raw = readRaw(store, recordKey);
    setHydratedRaw(raw);
    setValues(mergeDocumentationValues(parseSaved(raw)));
  }

  function hydrated(): PhenoDocumentationValues {
    return values ?? mergeDocumentationValues(loadSaved(store, recordType, recordId, userId));
  }

  /** Edits keep a conflict notice up: Save stays blocked until discard. */
  function markEdited() {
    dirtyRef.current = true;
    setSaveStatus((prev) => (prev === "conflict" ? "conflict" : "idle"));
  }

  /** Drop unsaved typing and show the record as stored now. */
  function discardAndReload() {
    const raw = readRaw(store, recordKey);
    dirtyRef.current = false;
    setHydratedRaw(raw);
    setValues(mergeDocumentationValues(parseSaved(raw)));
    setSaveStatus("idle");
  }

  function setField(sectionKey: string, fieldKey: string, value: string) {
    markEdited();
    hydrateForEdit();
    setValues((prev) => {
      const base = prev ?? mergeDocumentationValues(loadSaved(store, recordType, recordId, userId));
      return {
        ...base,
        [sectionKey]: {
          ...base[sectionKey],
          fields: { ...base[sectionKey].fields, [fieldKey]: value },
        },
      };
    });
  }

  function setDiary(sectionKey: string, diaryEntryId: string | null) {
    markEdited();
    hydrateForEdit();
    setValues((prev) => {
      const base = prev ?? mergeDocumentationValues(loadSaved(store, recordType, recordId, userId));
      return {
        ...base,
        [sectionKey]: { ...base[sectionKey], diaryEntryId },
      };
    });
  }

  function onSave() {
    if (saveStatus === "conflict") return;
    if (store === null) {
      setSaveStatus("failed");
      return;
    }
    const currentRaw = readRaw(store, recordKey);
    if (values !== null && !canSavePhenoDocOverStored(hydratedRaw ?? null, currentRaw)) {
      if (dirtyRef.current) {
        // Unsaved typing over a newer stored record: keep it, never write.
        setSaveStatus("conflict");
        return;
      }
      // Stale form: never write over the newer stored record. Show it instead.
      setValues(mergeDocumentationValues(parseSaved(currentRaw)));
      setHydratedRaw(currentRaw);
      setSaveStatus("stale");
      return;
    }
    try {
      const next = JSON.stringify(hydrated());
      store.setItem(recordKey, next);
      setHydratedRaw(next);
      dirtyRef.current = false;
      setSaveStatus("saved");
    } catch {
      // storage may be unavailable; keep values in-memory
      setSaveStatus("failed");
    }
  }

  return (
    <section
      data-testid={`pheno-documentation-${recordType}-${recordId}`}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <header>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Saved on this device only. This documentation is not saved to your Verdant account or
          synced to another browser. Defaults never overwrite what you have already entered.
          {recordType === "candidate"
            ? " Use “Download backup” on the hunt page to keep a copy."
            : ""}
        </p>
      </header>

      {PHENO_DOCUMENTATION_DEFAULTS.map((section) => {
        const sectionOpen = defaultOpen || openSections.has(section.key);
        // Fields mount only for open sections; values hydrate on first open.
        const sVals = sectionOpen ? hydrated()[section.key] : null;
        return (
          <details
            key={section.key}
            data-testid={`pheno-doc-section-${section.key}`}
            className="rounded border border-border bg-background/40 p-3 text-sm"
            open={defaultOpen ? true : undefined}
            onToggle={
              defaultOpen
                ? undefined
                : (e) => {
                    const isOpen = (e.target as HTMLDetailsElement).open;
                    hydrateForEdit();
                    setOpenSections((prev) => {
                      const next = new Set(prev);
                      if (isOpen) next.add(section.key);
                      else next.delete(section.key);
                      return next;
                    });
                  }
            }
          >
            <summary className="cursor-pointer font-medium">{section.title}</summary>
            {sVals && (
              <div className="mt-2 space-y-2">
                {section.fields.map((f) => {
                  const id = `${recordType}-${recordId}-${section.key}-${f.key}`;
                  return (
                    <label key={f.key} className="block text-xs">
                      <span className="mb-1 block font-medium text-foreground">{f.label}</span>
                      {f.multiline ? (
                        <textarea
                          id={id}
                          data-testid={`pheno-doc-field-${section.key}-${f.key}`}
                          rows={2}
                          value={sVals.fields[f.key] ?? ""}
                          onChange={(e) => setField(section.key, f.key, e.target.value)}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <input
                          id={id}
                          type="text"
                          data-testid={`pheno-doc-field-${section.key}-${f.key}`}
                          value={sVals.fields[f.key] ?? ""}
                          onChange={(e) => setField(section.key, f.key, e.target.value)}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      )}
                    </label>
                  );
                })}

                {diaryOptions && diaryOptions.length > 0 && (
                  <label className="block text-xs">
                    <span className="mb-1 block font-medium text-foreground">
                      Diary reference (optional)
                    </span>
                    <select
                      data-testid={`pheno-doc-diary-${section.key}`}
                      value={sVals.diaryEntryId ?? ""}
                      onChange={(e) => setDiary(section.key, e.target.value || null)}
                      className="w-full rounded border border-border bg-background px-2 py-1"
                    >
                      <option value="">— none —</option>
                      {diaryOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </details>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid={`pheno-doc-save-${recordType}-${recordId}`}
          onClick={onSave}
          disabled={saveStatus === "conflict"}
          className="rounded-md border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Save on this device
        </button>
        {saveStatus === "saved" && (
          <span
            role="status"
            data-testid={`pheno-doc-saved-${recordType}-${recordId}`}
            className="text-xs text-emerald-600"
          >
            Saved on this device
          </span>
        )}
        {saveStatus === "failed" && (
          <span
            role="alert"
            data-testid={`pheno-doc-save-failed-${recordType}-${recordId}`}
            className="text-xs text-amber-700 dark:text-amber-300"
          >
            Could not save on this device. Your edits remain open in this tab; try again.
          </span>
        )}
        {saveStatus === "stale" && (
          <span
            role="alert"
            data-testid={`pheno-doc-save-stale-${recordType}-${recordId}`}
            className="text-xs text-amber-700 dark:text-amber-300"
          >
            Not saved: this record changed on this device after you opened it (a restore or another
            tab). The latest saved values are shown now; re-enter your changes and save again.
          </span>
        )}
      </div>
      {saveStatus === "conflict" && (
        <div
          role="alert"
          data-testid={`pheno-doc-conflict-${recordType}-${recordId}`}
          className="space-y-2 rounded border border-amber-500/50 p-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <p>
            This record changed on this device after you started typing (a restore or another tab).
            Your unsaved changes are still shown, but saving is blocked so they can&apos;t overwrite
            the newer record. Copy anything you want to keep, then load the saved record.
          </p>
          <button
            type="button"
            data-testid={`pheno-doc-conflict-reload-${recordType}-${recordId}`}
            onClick={discardAndReload}
            className="rounded-md border border-border px-2 py-1 font-medium"
          >
            Discard my changes and load the saved record
          </button>
        </div>
      )}
    </section>
  );
}
