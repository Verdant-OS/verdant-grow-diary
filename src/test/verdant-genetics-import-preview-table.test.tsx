/**
 * verdant-genetics-import-preview-table — presenter tests for the
 * row-numbered, missing-required-highlighted preview table.
 *
 * No Supabase, no file I/O, no writes.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { VerdantGeneticsImportPreviewTable } from "@/components/VerdantGeneticsImportPreviewTable";
import { buildGeneticsImportPreview } from "@/lib/verdantGeneticsImportPreviewRules";

const HEADER = ["Strain", "Breeder", "Seed Type", "Lineage", "Flowering Time", "Notes"];

describe("VerdantGeneticsImportPreviewTable", () => {
  it("renders empty state when no rows", () => {
    render(<VerdantGeneticsImportPreviewTable rows={[]} />);
    expect(screen.getByTestId("genetics-preview-empty")).toBeInTheDocument();
  });

  it("highlights blocked rows and marks valid rows ready", () => {
    const { rows } = buildGeneticsImportPreview([
      HEADER,
      ["Blueberry", "Dutch Passion", "feminized", null, "8", null],
      ["", "Sensi", "feminized", null, "9", null],
    ]);
    render(<VerdantGeneticsImportPreviewTable rows={rows} />);

    const valid = screen.getByTestId("genetics-preview-row-2");
    expect(valid.getAttribute("data-status")).toBe("valid");
    expect(screen.getByTestId("genetics-preview-row-2-status").textContent).toBe("Ready");

    const blocked = screen.getByTestId("genetics-preview-row-3");
    expect(blocked.getAttribute("data-status")).toBe("blocked");
    expect(blocked.querySelector('[data-missing="true"]')).not.toBeNull();
    expect(blocked.textContent).toContain("Row 3 is missing strain name.");
  });
});
