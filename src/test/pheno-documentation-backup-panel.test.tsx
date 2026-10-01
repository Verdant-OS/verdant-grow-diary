/**
 * #552 — hunt-level Download / Restore of device-saved candidate documentation.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PhenoDocumentationBackupPanel from "@/components/PhenoDocumentationBackupPanel";
import {
  PHENO_DOC_BACKUP_COPY,
  PHENO_DOC_BACKUP_FORMAT,
  phenoDocStorageKey,
} from "@/lib/phenoDocumentationBackupRules";

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

afterEach(() => cleanup());

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const notes = (t: string) => ({ phenotype: { fields: { unique_traits: t }, diaryEntryId: null } });

function backupFile(records: unknown[]) {
  const text = JSON.stringify({
    format: PHENO_DOC_BACKUP_FORMAT,
    version: 1,
    exportedAt: "x",
    records,
  });
  return new File([text], "backup.json", { type: "application/json" });
}

describe("PhenoDocumentationBackupPanel", () => {
  it("downloads this user's device-saved candidate documentation", () => {
    const storage = memoryStorage({
      [phenoDocStorageKey("candidate", "p1", "u1")]: JSON.stringify(notes("tall")),
      [phenoDocStorageKey("candidate", "p9", "someone-else")]: JSON.stringify(notes("x")),
    });
    const download = vi.fn();
    render(
      <PhenoDocumentationBackupPanel
        storage={storage}
        download={download}
        now={() => "2026-10-01T12:00:00.000Z"}
        confirm={() => true}
      />,
    );
    fireEvent.click(screen.getByTestId("pheno-doc-backup-download"));
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, text] = download.mock.calls[0];
    expect(filename).toBe("verdant-candidate-documentation-2026-10-01.json");
    const parsed = JSON.parse(text);
    expect(parsed.records.map((r: { recordId: string }) => r.recordId)).toEqual(["p1"]);
    expect(text).not.toContain("u1");
    expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
      PHENO_DOC_BACKUP_COPY.downloaded(1),
    );
  });

  it("says so when there is nothing to back up", () => {
    const download = vi.fn();
    render(
      <PhenoDocumentationBackupPanel
        storage={memoryStorage()}
        download={download}
        now={() => "x"}
        confirm={() => true}
      />,
    );
    fireEvent.click(screen.getByTestId("pheno-doc-backup-download"));
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
      PHENO_DOC_BACKUP_COPY.nothingToBackUp,
    );
  });

  it("restores new records under the signed-in user", async () => {
    const storage = memoryStorage();
    const confirm = vi.fn(() => true);
    render(
      <PhenoDocumentationBackupPanel
        storage={storage}
        download={vi.fn()}
        now={() => "x"}
        confirm={confirm}
      />,
    );
    fireEvent.change(screen.getByTestId("pheno-doc-backup-restore-input"), {
      target: {
        files: [backupFile([{ recordType: "candidate", recordId: "p1", values: notes("tall") }])],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
        PHENO_DOC_BACKUP_COPY.restored(1),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
    const saved = JSON.parse(storage.getItem(phenoDocStorageKey("candidate", "p1", "u1"))!);
    expect(saved.phenotype.fields.unique_traits).toBe("tall");
  });

  it("asks before overwriting, and changes nothing when declined", async () => {
    const key = phenoDocStorageKey("candidate", "p1", "u1");
    const storage = memoryStorage({ [key]: JSON.stringify(notes("mine")) });
    const confirm = vi.fn(() => false);
    render(
      <PhenoDocumentationBackupPanel
        storage={storage}
        download={vi.fn()}
        now={() => "x"}
        confirm={confirm}
      />,
    );
    fireEvent.change(screen.getByTestId("pheno-doc-backup-restore-input"), {
      target: {
        files: [backupFile([{ recordType: "candidate", recordId: "p1", values: notes("theirs") }])],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
        PHENO_DOC_BACKUP_COPY.cancelled,
      ),
    );
    expect(confirm).toHaveBeenCalledWith(PHENO_DOC_BACKUP_COPY.confirmOverwrite(1));
    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe("mine");
  });

  it("rejects an invalid file with calm copy and writes nothing", async () => {
    const storage = memoryStorage();
    render(
      <PhenoDocumentationBackupPanel
        storage={storage}
        download={vi.fn()}
        now={() => "x"}
        confirm={() => true}
      />,
    );
    fireEvent.change(screen.getByTestId("pheno-doc-backup-restore-input"), {
      target: { files: [new File(["not json"], "x.json")] },
    });
    await waitFor(() =>
      expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
        PHENO_DOC_BACKUP_COPY.invalid.not_json,
      ),
    );
    expect(storage.length).toBe(0);
  });
});
