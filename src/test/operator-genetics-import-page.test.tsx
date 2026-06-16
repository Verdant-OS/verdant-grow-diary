/**
 * operator-genetics-import-page — Operator Mode screen tests for the
 * Verdant genetics XLSX import preview workflow.
 *
 * The XLSX loader is injected so tests do not touch the real file
 * system or the xlsx dependency.
 *
 * No Supabase, no writes, no AI, no Action Queue, no device control.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  VerdantGeneticsXlsxImportPanel,
  GENETICS_LINK_DISABLED_COPY,
} from "@/components/VerdantGeneticsXlsxImportPanel";
import OperatorGeneticsImportPage from "@/pages/OperatorGeneticsImportPage";

const HEADER = ["Strain", "Breeder", "Seed Type", "Lineage", "Flowering Time", "Notes"];

function makeFile(name = "genetics.xlsx"): File {
  return new File([new Uint8Array([1, 2, 3])], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function uploadFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("OperatorGeneticsImportPage", () => {
  it("renders heading and panel with safe copy", () => {
    render(<OperatorGeneticsImportPage />);
    expect(
      screen.getByRole("heading", { name: /Genetics XLSX Import/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("genetics-import-panel")).toBeInTheDocument();
    expect(screen.getByText(/No data saved until confirmed/i)).toBeInTheDocument();
  });
});

describe("VerdantGeneticsXlsxImportPanel", () => {
  it("shows empty preview state before upload", () => {
    render(<VerdantGeneticsXlsxImportPanel loader={async () => []} />);
    expect(screen.getByTestId("genetics-xlsx-file-input")).toBeInTheDocument();
    expect(screen.queryByTestId("genetics-preview-table")).not.toBeInTheDocument();
  });

  it("shows user-friendly error when loader throws", async () => {
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => {
          throw new Error("low-level parse boom");
        }}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-file-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-file-error").textContent).not.toContain(
      "low-level parse boom",
    );
    expect(screen.getByTestId("genetics-file-error").textContent).toMatch(
      /valid \.xlsx genetics sheet/i,
    );
  });

  it("shows file-level error for unrecognized sheet", async () => {
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          ["foo", "bar", "baz"],
          ["a", "b", "c"],
        ]}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-file-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-file-error").textContent).toMatch(
      /does not contain a recognizable genetics sheet/i,
    );
  });

  it("renders preview table after a successful parse", async () => {
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
          ["", "Sensi", "feminized", null, "9", null],
        ]}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-preview-table")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-preview-row-2")).toHaveAttribute(
      "data-status",
      "valid",
    );
    expect(screen.getByTestId("genetics-preview-row-3")).toHaveAttribute(
      "data-status",
      "blocked",
    );
    expect(screen.getByTestId("genetics-preview-summary").textContent).toMatch(
      /Total: 2/,
    );
  });

  it("disables link action with blocker copy when no onLink helper is provided", async () => {
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
        ]}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-link-button")).toBeDisabled(),
    );
    expect(screen.getByTestId("genetics-link-disabled-copy").textContent).toBe(
      GENETICS_LINK_DISABLED_COPY,
    );
  });

  it("calls onLink exactly once with valid rows only when confirmed", async () => {
    const onLink = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
          ["", "Sensi", "feminized", null, "9", null],
          ["Northern", "Sensi", "wat", null, "9", null],
          ["Critical", "Royal Queen", "auto", null, "soon", null],
        ]}
        onLink={onLink}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-link-button")).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId("genetics-link-button"));
    await waitFor(() => expect(onLink).toHaveBeenCalledTimes(1));
    const passed = onLink.mock.calls[0][0] as Array<{ rowNumber: number }>;
    expect(passed.map((r) => r.rowNumber).sort()).toEqual([2, 5]);
  });

  it("disables link action when no importable rows", async () => {
    const onLink = vi.fn();
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [HEADER, ["", "Sensi", "feminized", null, "9", null]]}
        onLink={onLink}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-preview-table")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-link-button")).toBeDisabled();
    expect(onLink).not.toHaveBeenCalled();
  });
});

describe("page safety copy", () => {
  it("renders preview-only/no-data-saved copy and does not show 'live' or 'import complete'", () => {
    render(<OperatorGeneticsImportPage />);
    expect(
      screen.getByTestId("operator-genetics-import-safety").textContent,
    ).toMatch(/Batch linking is not enabled yet/i);
    expect(screen.getByText(/No data saved until confirmed/i)).toBeInTheDocument();
    // No misleading copy before any upload/confirmation.
    // Allow the cautionary "No data saved until confirmed" copy, but
    // assert no misleading affirmative copy is shown before any upload.
    expect(screen.queryByText(/\blive\b/i)).toBeNull();
    expect(screen.queryByText(/\bdata saved\b(?! until)/i)).toBeNull();
    expect(screen.queryByText(/import complete/i)).toBeNull();
  });
});

describe("validation export + template download", () => {
  function stubDownload() {
    const captures: Array<{ content: string; filename: string }> = [];
    const realBlob = globalThis.Blob;
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    class PatchedBlob extends realBlob {
      constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        const text = (parts ?? [])
          .map((p) => (typeof p === "string" ? p : ""))
          .join("");
        captures.push({ content: text, filename: "" });
      }
    }
    globalThis.Blob = PatchedBlob as unknown as typeof Blob;
    URL.createObjectURL = (() => "blob://stub") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as unknown as typeof URL.revokeObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const a = this as HTMLAnchorElement;
      if (captures.length > 0) captures[captures.length - 1].filename = a.download;
    };
    return {
      blobs: captures,
      lastContent() {
        const last = captures[captures.length - 1];
        return Promise.resolve({ filename: last.filename, content: last.content });
      },
      restore() {
        globalThis.Blob = realBlob;
        URL.createObjectURL = realCreate;
        URL.revokeObjectURL = realRevoke;
        HTMLAnchorElement.prototype.click = origClick;
      },
    };
  }

  it("export button is disabled before parse, enabled after", async () => {
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
        ]}
      />,
    );
    expect(screen.getByTestId("genetics-export-report-button")).toBeDisabled();
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-export-report-button")).not.toBeDisabled(),
    );
  });

  it("renders the Download CSV template button and the CSV-fallback copy", () => {
    render(<VerdantGeneticsXlsxImportPanel loader={async () => []} />);
    const btn = screen.getByTestId("genetics-template-button");
    expect(btn.textContent).toMatch(/CSV template/i);
    expect(
      screen.getByTestId("genetics-template-fallback-copy").textContent,
    ).toMatch(/XLSX template export is blocked/i);
  });

  it("exports a validation report containing row number, status, and messages", async () => {
    const stub = stubDownload();
    try {
      render(
        <VerdantGeneticsXlsxImportPanel
          loader={async () => [
            HEADER,
            ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
            ["", "Sensi", "feminized", null, "9", null],
            ["Critical", "Royal Queen", "auto", null, "soon", null],
          ]}
        />,
      );
      uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
      await waitFor(() =>
        expect(screen.getByTestId("genetics-export-report-button")).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByTestId("genetics-export-report-button"));
      await waitFor(() => expect(stub.blobs.length).toBeGreaterThan(0));
      const { content: csv, filename: fname } = await stub.lastContent();
      expect(fname).toBe("verdant-genetics-validation-report.csv");
      expect(csv).toContain("row_number,status,strain");
      expect(csv).toContain("valid");
      expect(csv).toContain("blocked");
      expect(csv).toContain("warning");
      expect(csv).toContain("Row 3 is missing strain name.");
    } finally {
      stub.restore();
    }
  });

  it("downloads a CSV template with required columns and example rows", async () => {
    const stub = stubDownload();
    try {
      render(<VerdantGeneticsXlsxImportPanel loader={async () => []} />);
      fireEvent.click(screen.getByTestId("genetics-template-button"));
      await waitFor(() => expect(stub.blobs.length).toBeGreaterThan(0));
      const { content: csv, filename: fname } = await stub.lastContent();
      expect(fname).toBe("verdant-genetics-template.csv");
      expect(csv).toContain("strain,breeder,seed_type");
      expect(csv).toContain("Example Auto");
      expect(csv).toContain("Example Fem");
      expect(csv).toContain("Example Regular");
    } finally {
      stub.restore();
    }
  });
});

describe("duplicate header warnings", () => {
  it("surfaces a duplicate-mapped-headers alert in the panel", async () => {
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          ["Strain", "Variety", "Breeder", "Seed Type"],
          ["First", "Second", "B", "auto"],
        ]}
      />,
    );
    uploadFile(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-file-warnings")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-file-warnings").textContent).toMatch(
      /Duplicate mapped headers detected/,
    );
    expect(screen.getByTestId("genetics-file-warnings").textContent).toMatch(
      /Field "strain" used column "Strain" and ignored "Variety"/,
    );
  });
});
