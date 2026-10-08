/**
 * PhenoDocumentationBackupPanel — #552.
 *
 * Candidate documentation is saved on this device only. This panel lets the
 * grower download a JSON backup of their device-saved candidate documentation
 * and restore it on another device. Presenter + local I/O only: no network,
 * no schema. Validation and planning live in phenoDocumentationBackupRules;
 * the backup file is treated as untrusted.
 */
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import {
  PHENO_DOC_BACKUP_COPY,
  PHENO_DOC_BACKUP_MAX_TEXT_LENGTH,
  PHENO_DOCS_RESTORED_EVENT,
  buildPhenoDocumentationBackup,
  listExistingPhenoDocKeys,
  listPhenoDocRecordsInStorage,
  parsePhenoDocumentationBackup,
  planPhenoDocumentationRestore,
  type PhenoDocStorageReader,
  type PhenoDocsRestoredDetail,
} from "@/lib/phenoDocumentationBackupRules";

type BackupStorage = PhenoDocStorageReader & { setItem(key: string, value: string): void };

export interface PhenoDocumentationBackupPanelProps {
  /** Storage override (tests). Defaults to window.localStorage. */
  storage?: BackupStorage;
  /** File download override (tests). */
  download?: (filename: string, text: string) => void;
  /** Clock override (tests). Returns an ISO timestamp. */
  now?: () => string;
  /** Confirmation override (tests). */
  confirm?: (message: string) => boolean;
}

function defaultStorage(): BackupStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultDownload(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tell mounted documentation forms which records the restore replaced. */
function announceRestored(keys: string[]) {
  if (keys.length === 0 || typeof window === "undefined") return;
  const detail: PhenoDocsRestoredDetail = { keys };
  window.dispatchEvent(new CustomEvent(PHENO_DOCS_RESTORED_EVENT, { detail }));
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export default function PhenoDocumentationBackupPanel({
  storage,
  download = defaultDownload,
  now = () => new Date().toISOString(),
  confirm = (m) => window.confirm(m),
}: PhenoDocumentationBackupPanelProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const store = useMemo(() => storage ?? defaultStorage(), [storage]);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onDownload = () => {
    if (!userId) return setStatus(PHENO_DOC_BACKUP_COPY.signedOut);
    if (!store) return setStatus(PHENO_DOC_BACKUP_COPY.storageUnavailable);
    const records = listPhenoDocRecordsInStorage(store, userId, "candidate");
    if (records.length === 0) return setStatus(PHENO_DOC_BACKUP_COPY.nothingToBackUp);
    const exportedAt = now();
    const backup = buildPhenoDocumentationBackup({ records, exportedAt });
    download(
      `verdant-candidate-documentation-${exportedAt.slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
    );
    setStatus(PHENO_DOC_BACKUP_COPY.downloaded(records.length));
  };

  const onRestoreFile = async (file: File | undefined) => {
    if (!file) return;
    if (!userId) return setStatus(PHENO_DOC_BACKUP_COPY.signedOut);
    if (!store) return setStatus(PHENO_DOC_BACKUP_COPY.storageUnavailable);
    // Check the size before reading: a huge file must not be pulled into
    // memory just to be rejected by the parser (#552 Codex P2).
    if (file.size > PHENO_DOC_BACKUP_MAX_TEXT_LENGTH) {
      return setStatus(PHENO_DOC_BACKUP_COPY.invalid.too_large);
    }
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      return setStatus(PHENO_DOC_BACKUP_COPY.invalid.not_json);
    }
    const parsed = parsePhenoDocumentationBackup(text);
    if (!parsed.ok) return setStatus(PHENO_DOC_BACKUP_COPY.invalid[parsed.reason]);
    const plan = planPhenoDocumentationRestore({
      userId,
      existingKeys: listExistingPhenoDocKeys(store),
      records: parsed.records,
    });
    if (
      plan.overwriteCount > 0 &&
      !confirm(PHENO_DOC_BACKUP_COPY.confirmOverwrite(plan.overwriteCount))
    ) {
      return setStatus(PHENO_DOC_BACKUP_COPY.cancelled);
    }
    const written: string[] = [];
    try {
      for (const w of plan.writes) {
        store.setItem(w.key, w.value);
        written.push(w.key);
      }
    } catch {
      // Storage filled up (quota) partway: the records already written stay
      // written, so say exactly how many landed instead of hiding it.
      announceRestored(written);
      return setStatus(
        written.length === 0
          ? PHENO_DOC_BACKUP_COPY.storageUnavailable
          : PHENO_DOC_BACKUP_COPY.restoredPartial(written.length, plan.writes.length),
      );
    }
    announceRestored(written);
    setStatus(PHENO_DOC_BACKUP_COPY.restored(plan.writes.length));
  };

  return (
    <section
      data-testid="pheno-doc-backup"
      className="space-y-2 rounded-lg border border-border bg-card p-3 text-sm"
    >
      <h2 className="text-sm font-semibold">{PHENO_DOC_BACKUP_COPY.heading}</h2>
      <p className="text-xs text-muted-foreground">{PHENO_DOC_BACKUP_COPY.explainer}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="pheno-doc-backup-download"
          onClick={onDownload}
        >
          {PHENO_DOC_BACKUP_COPY.download}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="pheno-doc-backup-restore"
          onClick={() => fileInput.current?.click()}
        >
          {PHENO_DOC_BACKUP_COPY.restore}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="pheno-doc-backup-restore-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void onRestoreFile(file);
          }}
        />
      </div>
      {status ? (
        <p
          role="status"
          className="text-xs text-muted-foreground"
          data-testid="pheno-doc-backup-status"
        >
          {status}
        </p>
      ) : null}
    </section>
  );
}
