/**
 * PhenoDocumentationSections — default documentation sections for
 * PHENOHUNT candidate / breeding program records.
 *
 * Presenter-only. Persists to localStorage keyed by (recordType, recordId)
 * so saved values survive across sessions without touching schema or RLS.
 * Defaults populate empty fields but never overwrite anything already saved.
 */
import { useEffect, useMemo, useState } from "react";
import {
  PHENO_DOCUMENTATION_DEFAULTS,
  mergeDocumentationValues,
  type PhenoDocumentationValues,
} from "@/constants/phenoDocumentationDefaults";

export type PhenoDocRecordType = "candidate" | "breeding_program";

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

function storageKey(recordType: PhenoDocRecordType, recordId: string): string {
  return `phenoDocs:${recordType}:${recordId}`;
}

function loadSaved(
  storage: Pick<Storage, "getItem" | "setItem">,
  recordType: PhenoDocRecordType,
  recordId: string,
): PhenoDocumentationValues | null {
  try {
    const raw = storage.getItem(storageKey(recordType, recordId));
    if (!raw) return null;
    return JSON.parse(raw) as PhenoDocumentationValues;
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
  const store = useMemo<Pick<Storage, "getItem" | "setItem">>(
    () =>
      storage ??
      (typeof window !== "undefined"
        ? window.localStorage
        : { getItem: () => null, setItem: () => undefined }),
    [storage],
  );

  // Lazy hydration: null = storage not read yet (collapsed mode only). The
  // eager path preserves the original mount-time read for defaultOpen users.
  const [values, setValues] = useState<PhenoDocumentationValues | null>(() =>
    defaultOpen ? mergeDocumentationValues(loadSaved(store, recordType, recordId)) : null,
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set());

  // Re-hydrate if the record identity changes (e.g. switching candidates).
  useEffect(() => {
    setValues(
      defaultOpen ? mergeDocumentationValues(loadSaved(store, recordType, recordId)) : null,
    );
    setOpenSections(new Set());
    setSavedAt(null);
  }, [store, recordType, recordId, defaultOpen]);

  function hydrated(): PhenoDocumentationValues {
    return values ?? mergeDocumentationValues(loadSaved(store, recordType, recordId));
  }

  function setField(sectionKey: string, fieldKey: string, value: string) {
    setSavedAt(null);
    setValues((prev) => {
      const base = prev ?? mergeDocumentationValues(loadSaved(store, recordType, recordId));
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
    setSavedAt(null);
    setValues((prev) => {
      const base = prev ?? mergeDocumentationValues(loadSaved(store, recordType, recordId));
      return {
        ...base,
        [sectionKey]: { ...base[sectionKey], diaryEntryId },
      };
    });
  }

  function onSave() {
    try {
      store.setItem(storageKey(recordType, recordId), JSON.stringify(hydrated()));
      setSavedAt(Date.now());
    } catch {
      // storage may be unavailable; keep values in-memory
      setSavedAt(Date.now());
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
          Default documentation for this record. Every field is editable and saved values persist.
          Defaults never overwrite what you have already entered.
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
                    setValues(
                      (prev) =>
                        prev ?? mergeDocumentationValues(loadSaved(store, recordType, recordId)),
                    );
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
          className="rounded-md border border-border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Save documentation
        </button>
        {savedAt != null && (
          <span
            data-testid={`pheno-doc-saved-${recordType}-${recordId}`}
            className="text-xs text-emerald-600"
          >
            Saved
          </span>
        )}
      </div>
    </section>
  );
}
