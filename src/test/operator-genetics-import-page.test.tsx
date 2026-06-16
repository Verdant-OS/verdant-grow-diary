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
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

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
    const user = userEvent.setup();
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => {
          throw new Error("low-level parse boom");
        }}
      />,
    );
    await user.upload(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
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
    const user = userEvent.setup();
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          ["foo", "bar", "baz"],
          ["a", "b", "c"],
        ]}
      />,
    );
    await user.upload(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-file-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-file-error").textContent).toMatch(
      /does not contain a recognizable genetics sheet/i,
    );
  });

  it("renders preview table after a successful parse", async () => {
    const user = userEvent.setup();
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
          ["", "Sensi", "feminized", null, "9", null],
        ]}
      />,
    );
    await user.upload(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
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
    const user = userEvent.setup();
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
        ]}
      />,
    );
    await user.upload(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-link-button")).toBeDisabled(),
    );
    expect(screen.getByTestId("genetics-link-disabled-copy").textContent).toBe(
      GENETICS_LINK_DISABLED_COPY,
    );
  });

  it("calls onLink exactly once with valid rows only when confirmed", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn().mockResolvedValue(undefined);
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [
          HEADER,
          ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
          ["", "Sensi", "feminized", null, "9", null], // blocked
          ["Northern", "Sensi", "wat", null, "9", null], // blocked invalid seed type
          ["Critical", "Royal Queen", "auto", null, "soon", null], // warning - included
        ]}
        onLink={onLink}
      />,
    );
    await user.upload(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-link-button")).toBeEnabled(),
    );
    await user.click(screen.getByTestId("genetics-link-button"));
    await waitFor(() => expect(onLink).toHaveBeenCalledTimes(1));
    const passed = onLink.mock.calls[0][0] as Array<{ rowNumber: number }>;
    expect(passed.map((r) => r.rowNumber).sort()).toEqual([2, 5]);
  });

  it("disables link action when no importable rows", async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(
      <VerdantGeneticsXlsxImportPanel
        loader={async () => [HEADER, ["", "Sensi", "feminized", null, "9", null]]}
        onLink={onLink}
      />,
    );
    await user.upload(screen.getByTestId("genetics-xlsx-file-input"), makeFile());
    await waitFor(() =>
      expect(screen.getByTestId("genetics-preview-table")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("genetics-link-button")).toBeDisabled();
    expect(onLink).not.toHaveBeenCalled();
  });
});
