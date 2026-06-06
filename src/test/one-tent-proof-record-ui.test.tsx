/**
 * UI tests for the One-Tent Proof Record export screen.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentProofRecord from "@/pages/OneTentProofRecord";
import { ALLOWED_SOURCE_LABELS } from "@/lib/oneTentProofRecordExportRules";

afterEach(() => cleanup());

function renderPage() {
  return render(
    <MemoryRouter>
      <OneTentProofRecord />
    </MemoryRouter>,
  );
}

function fillScope() {
  fireEvent.change(screen.getByLabelText("Grow id"), { target: { value: "g-1" } });
  fireEvent.change(screen.getByLabelText("Tent id"), { target: { value: "t-1" } });
  fireEvent.change(screen.getByLabelText("Plant id"), { target: { value: "p-1" } });
}

describe("OneTentProofRecord screen", () => {
  it("labels itself as Proof Record / Review only / Unverified", () => {
    renderPage();
    expect(screen.getByTestId("chip-proof-record").textContent).toMatch(/Proof Record/i);
    expect(screen.getByTestId("chip-review-only").textContent).toMatch(/Review only/i);
    expect(screen.getByTestId("chip-unverified").textContent).toMatch(/Unverified/i);
    expect(screen.getByRole("heading", { name: /One-Tent Proof Record/i })).toBeTruthy();
  });

  it("renders the 'Operator Self-Report (unverified)' subhead", () => {
    renderPage();
    expect(screen.getByTestId("self-report-subhead").textContent ?? "").toBe(
      "Operator Self-Report (unverified)",
    );
  });

  it("source-label select options exactly equal ALLOWED_SOURCE_LABELS", () => {
    renderPage();
    const select = screen.getByTestId("source-label-select") as HTMLSelectElement;
    // First option is the empty `(not captured)` placeholder; the rest must
    // match the enum exactly and in order.
    const values = Array.from(select.options).map((o) => o.value);
    expect(values[0]).toBe("");
    expect(values.slice(1)).toEqual([...ALLOWED_SOURCE_LABELS]);
  });

  it("allowed-labels header copy is generated from ALLOWED_SOURCE_LABELS", () => {
    renderPage();
    const copy = screen.getByTestId("allowed-labels-copy").textContent ?? "";
    for (const label of ALLOWED_SOURCE_LABELS) {
      const Title = label.charAt(0).toUpperCase() + label.slice(1);
      expect(copy).toContain(Title);
    }
    // Includes `Unknown` (closes the audit-found drift).
    expect(copy).toContain("Unknown");
  });

  it("reflects the chosen non-live source label without requiring capturedAt", () => {
    renderPage();
    const select = screen.getByLabelText(/Source label/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "manual" } });
    const pre = screen.getByTestId("proof-record-preview");
    expect(pre.textContent ?? "").toContain('"sourceLabel": "manual"');
    const badge = screen.getByTestId("active-source-label");
    expect(badge.textContent ?? "").toMatch(/manual/i);
  });

  it("'Source: live' chip requires both source label AND capturedAt", () => {
    renderPage();
    const select = screen.getByLabelText(/Source label/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "live" } });
    // Capture not yet entered: chip must NOT render.
    expect(screen.queryByTestId("active-source-label")).toBeNull();

    // Now provide capturedAt: chip renders.
    fireEvent.change(screen.getByLabelText(/Captured at \(ISO\)/i), {
      target: { value: "2026-06-06T10:00:00Z" },
    });
    const badge = screen.getByTestId("active-source-label");
    expect(badge.textContent ?? "").toMatch(/live/i);
  });

  it("Download is disabled and helper renders with role=status when scope is blank", () => {
    renderPage();
    const btn = screen.getByTestId("download-proof-record") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const helper = screen.getByTestId("empty-record-helper");
    expect(helper.getAttribute("role")).toBe("status");
    expect(helper.textContent ?? "").toMatch(
      /Record is empty — fill at least scope \+ one loop step before exporting\./,
    );
  });

  it("Download stays disabled with scope only and no loop-step evidence", () => {
    renderPage();
    fillScope();
    const btn = screen.getByTestId("download-proof-record") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("empty-record-helper")).toBeTruthy();
  });

  it("Download enables once scope + a loop-step evidence id are present, and creates a JSON blob", () => {
    const created: { type?: string; size: number }[] = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push({ type: blob.type, size: blob.size });
      return "blob:fake";
    }) as any;
    URL.revokeObjectURL = vi.fn() as any;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      renderPage();
      fillScope();
      fireEvent.change(screen.getByLabelText("Quick Log diary entry id"), {
        target: { value: "diary-1" },
      });
      const btn = screen.getByTestId("download-proof-record") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(screen.queryByTestId("empty-record-helper")).toBeNull();

      fireEvent.click(btn);
      expect(created.length).toBe(1);
      expect(created[0].type).toBe("application/json");
      expect(created[0].size).toBeGreaterThan(0);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it("preview JSON includes the integrity block self-identifying as unverified", () => {
    renderPage();
    const pre = screen.getByTestId("proof-record-preview");
    expect(pre.textContent ?? "").toContain('"unverified": true');
  });
});

describe("OneTentProofRecord safety scan (static)", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/pages/OneTentProofRecord.tsx"),
    "utf8",
  );

  it("contains no Supabase writes or RPC/edge-function calls", () => {
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/\brpc\s*\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/from\s*\(\s*['"]/); // no .from('table')
  });

  it("does not import Supabase client or auth headers", () => {
    // Strip comments so the doc-block words like "No Supabase reads..." don't
    // false-positive. The intent is: no Supabase IMPORTS or runtime usage.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(codeOnly).not.toMatch(/\bsupabase\./i);
    expect(codeOnly.toLowerCase()).not.toContain("service_role");
    expect(codeOnly.toLowerCase()).not.toContain("raw_payload");
    expect(codeOnly.toLowerCase()).not.toContain("bearer ");
    expect(codeOnly.toLowerCase()).not.toContain("bridge_token");
  });

  it("contains no network/fetch primitives", () => {
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/navigator\.sendBeacon/);
  });

  it("does not include a PDF export until a shared safe helper exists", () => {
    expect(src.toLowerCase()).not.toContain("pdf");
  });
});
