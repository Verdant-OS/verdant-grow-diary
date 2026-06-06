/**
 * UI tests for the One-Tent Proof Record export screen.
 *
 * Safety scope:
 *  - Download button creates a JSON blob from the current proof state.
 *  - Screen surfaces "Proof Record" + "Review only" labels.
 *  - Manual source label, when chosen, is reflected in the rendered preview.
 *  - The page's source contains no insert/update/delete/functions.invoke calls.
 *  - PDF export is not present (deferred until a safe shared helper exists).
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OneTentProofRecord from "@/pages/OneTentProofRecord";

afterEach(() => cleanup());

function renderPage() {
  return render(
    <MemoryRouter>
      <OneTentProofRecord />
    </MemoryRouter>,
  );
}

describe("OneTentProofRecord screen", () => {
  it("labels itself as Proof Record / Review only", () => {
    renderPage();
    expect(screen.getByTestId("chip-proof-record").textContent).toMatch(/Proof Record/i);
    expect(screen.getByTestId("chip-review-only").textContent).toMatch(/Review only/i);
    expect(screen.getByRole("heading", { name: /One-Tent Proof Record/i })).toBeTruthy();
  });

  it("reflects the chosen manual source label in the rendered preview JSON", () => {
    renderPage();
    const select = screen.getByLabelText(/Source label/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "manual" } });
    const pre = screen.getByTestId("proof-record-preview");
    expect(pre.textContent ?? "").toContain('"sourceLabel": "manual"');
    const badge = screen.getByTestId("active-source-label");
    expect(badge.textContent ?? "").toMatch(/manual/i);
  });

  it("download button creates a JSON blob from the current proof state", () => {
    const created: { name?: string; type?: string; size: number }[] = [];
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
      const btn = screen.getByTestId("download-proof-record");
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
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src.toLowerCase()).not.toContain("service_role");
    expect(src.toLowerCase()).not.toContain("bridge_token");
  });

  it("does not include a PDF export until a shared safe helper exists", () => {
    expect(src.toLowerCase()).not.toContain("pdf");
  });
});
