/**
 * #552 — hunt-level Download / Restore of device-saved candidate documentation.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PhenoDocumentationBackupPanel from "@/components/PhenoDocumentationBackupPanel";
import PhenoDocumentationSections from "@/components/PhenoDocumentationSections";
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

  it("reports a partial restore when storage fills up partway", async () => {
    const storage = memoryStorage();
    let writes = 0;
    const quotaStorage = {
      ...storage,
      get length() {
        return storage.length;
      },
      setItem: (k: string, v: string) => {
        writes += 1;
        if (writes > 1) throw new Error("QuotaExceededError");
        storage.setItem(k, v);
      },
    };
    render(
      <PhenoDocumentationBackupPanel
        storage={quotaStorage}
        download={vi.fn()}
        now={() => "x"}
        confirm={() => true}
      />,
    );
    fireEvent.change(screen.getByTestId("pheno-doc-backup-restore-input"), {
      target: {
        files: [
          backupFile([
            { recordType: "candidate", recordId: "p1", values: notes("a") },
            { recordType: "candidate", recordId: "p2", values: notes("b") },
          ]),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
        PHENO_DOC_BACKUP_COPY.restoredPartial(1, 2),
      ),
    );
    expect(storage.getItem(phenoDocStorageKey("candidate", "p1", "u1"))).not.toBeNull();
    expect(storage.getItem(phenoDocStorageKey("candidate", "p2", "u1"))).toBeNull();
  });
});

describe("restore while a candidate's documentation form is open (#552 review P1)", () => {
  const field = "pheno-doc-field-phenotype-unique_traits";

  function restore(storage: ReturnType<typeof memoryStorage>, text: string) {
    fireEvent.change(screen.getByTestId("pheno-doc-backup-restore-input"), {
      target: {
        files: [backupFile([{ recordType: "candidate", recordId: "p1", values: notes(text) }])],
      },
    });
    return waitFor(() =>
      expect(screen.getByTestId("pheno-doc-backup-status").textContent).toBe(
        PHENO_DOC_BACKUP_COPY.restored(1),
      ),
    );
  }

  it("shows the restored values in an open form, and Save does not revert them", async () => {
    const key = phenoDocStorageKey("candidate", "p1", "u1");
    const storage = memoryStorage({ [key]: JSON.stringify(notes("old")) });
    render(
      <>
        <PhenoDocumentationBackupPanel
          storage={storage}
          download={vi.fn()}
          now={() => "x"}
          confirm={() => true}
        />
        <PhenoDocumentationSections recordId="p1" recordType="candidate" storage={storage} />
      </>,
    );
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("old");

    await restore(storage, "restored");

    await waitFor(() =>
      expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("restored"),
    );
    fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-p1"));
    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe("restored");
  });

  it("keeps unsaved typing in a collapsed form, warns, and blocks Save until discard", async () => {
    const key = phenoDocStorageKey("candidate", "p1", "u1");
    const storage = memoryStorage({ [key]: JSON.stringify(notes("old")) });
    render(
      <>
        <PhenoDocumentationBackupPanel
          storage={storage}
          download={vi.fn()}
          now={() => "x"}
          confirm={() => true}
        />
        <PhenoDocumentationSections
          recordId="p1"
          recordType="candidate"
          storage={storage}
          defaultOpen={false}
        />
      </>,
    );
    const details = screen.getByTestId("pheno-doc-section-phenotype") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(screen.getByTestId(field)).toBeTruthy());
    fireEvent.change(screen.getByTestId(field), { target: { value: "unsaved edit" } });

    await restore(storage, "restored");

    await waitFor(() => expect(screen.getByTestId("pheno-doc-conflict-candidate-p1")).toBeTruthy());
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("unsaved edit");
    const save = screen.getByTestId("pheno-doc-save-candidate-p1") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe("restored");

    fireEvent.click(screen.getByTestId("pheno-doc-conflict-reload-candidate-p1"));
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("restored");
    expect(screen.queryByTestId("pheno-doc-conflict-candidate-p1")).toBeNull();
    expect(save.disabled).toBe(false);
  });

  it("warns instead of silently replacing typing when a restore writes a record that was never saved", async () => {
    const key = phenoDocStorageKey("candidate", "p1", "u1");
    const storage = memoryStorage();
    const confirm = vi.fn(() => true);
    render(
      <>
        <PhenoDocumentationBackupPanel
          storage={storage}
          download={vi.fn()}
          now={() => "x"}
          confirm={confirm}
        />
        <PhenoDocumentationSections recordId="p1" recordType="candidate" storage={storage} />
      </>,
    );
    fireEvent.change(screen.getByTestId(field), { target: { value: "first draft" } });

    await restore(storage, "from backup");

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("pheno-doc-conflict-candidate-p1")).toBeTruthy());
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("first draft");
    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe("from backup");
  });

  it("refuses to Save a stale form when the record changed without a restore event", () => {
    const key = phenoDocStorageKey("candidate", "p1", "u1");
    const storage = memoryStorage({ [key]: JSON.stringify(notes("old")) });
    render(<PhenoDocumentationSections recordId="p1" recordType="candidate" storage={storage} />);
    fireEvent.change(screen.getByTestId(field), { target: { value: "stale edit" } });
    // e.g. another tab wrote the record and no storage event reached this form
    storage.setItem(key, JSON.stringify(notes("newer elsewhere")));

    fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-p1"));

    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe(
      "newer elsewhere",
    );
    // The typing is kept and Save is blocked until the grower discards it.
    expect(screen.getByTestId("pheno-doc-conflict-candidate-p1")).toBeTruthy();
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("stale edit");
    fireEvent.click(screen.getByTestId("pheno-doc-conflict-reload-candidate-p1"));
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("newer elsewhere");
    // Once it shows the stored record, a deliberate Save works again.
    fireEvent.change(screen.getByTestId(field), { target: { value: "after refresh" } });
    fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-p1"));
    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe("after refresh");
  });

  it("leaves forms for other candidates untouched", async () => {
    const otherKey = phenoDocStorageKey("candidate", "p2", "u1");
    const storage = memoryStorage({ [otherKey]: JSON.stringify(notes("p2 notes")) });
    render(
      <>
        <PhenoDocumentationBackupPanel
          storage={storage}
          download={vi.fn()}
          now={() => "x"}
          confirm={() => true}
        />
        <PhenoDocumentationSections recordId="p2" recordType="candidate" storage={storage} />
      </>,
    );
    fireEvent.change(screen.getByTestId(field), { target: { value: "p2 unsaved" } });
    await restore(storage, "p1 restored");
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("p2 unsaved");
  });
});

describe("cross-tab storage events (#552 review P2-2)", () => {
  const field = "pheno-doc-field-phenotype-unique_traits";
  const key = phenoDocStorageKey("candidate", "p1", "u1");

  function otherTabWrites(
    storage: ReturnType<typeof memoryStorage>,
    text: string,
    eventKey: string | null,
  ) {
    storage.setItem(key, JSON.stringify(notes(text)));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: eventKey }));
    });
  }

  it("refreshes a clean form when another tab writes its record", () => {
    const storage = memoryStorage({ [key]: JSON.stringify(notes("old")) });
    render(<PhenoDocumentationSections recordId="p1" recordType="candidate" storage={storage} />);
    otherTabWrites(storage, "from other tab", key);
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("from other tab");
    expect(screen.queryByTestId("pheno-doc-conflict-candidate-p1")).toBeNull();
  });

  it("ignores a storage event for another record", () => {
    const storage = memoryStorage({ [key]: JSON.stringify(notes("old")) });
    render(<PhenoDocumentationSections recordId="p1" recordType="candidate" storage={storage} />);
    fireEvent.change(screen.getByTestId(field), { target: { value: "typing" } });
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: phenoDocStorageKey("candidate", "p2", "u1") }),
      );
    });
    expect(screen.queryByTestId("pheno-doc-conflict-candidate-p1")).toBeNull();
  });

  it.each([
    ["the record key", key],
    ["key: null (storage cleared)", null],
  ])("keeps unsaved typing and blocks Save on a storage event for %s", (_label, eventKey) => {
    const storage = memoryStorage({ [key]: JSON.stringify(notes("old")) });
    render(<PhenoDocumentationSections recordId="p1" recordType="candidate" storage={storage} />);
    fireEvent.change(screen.getByTestId(field), { target: { value: "my typing" } });

    otherTabWrites(storage, "from other tab", eventKey);

    expect(screen.getByTestId("pheno-doc-conflict-candidate-p1")).toBeTruthy();
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("my typing");
    fireEvent.click(screen.getByTestId("pheno-doc-save-candidate-p1"));
    expect(JSON.parse(storage.getItem(key)!).phenotype.fields.unique_traits).toBe("from other tab");
    fireEvent.click(screen.getByTestId("pheno-doc-conflict-reload-candidate-p1"));
    expect((screen.getByTestId(field) as HTMLInputElement).value).toBe("from other tab");
  });
});
