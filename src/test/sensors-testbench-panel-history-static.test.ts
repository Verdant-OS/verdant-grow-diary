import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = readFileSync(
  resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"),
  "utf8",
);

describe("SensorsTestbenchPanel export/history/copy static safety", () => {
  it("wires diagnostics JSON/text/curl/PowerShell copy + download buttons", () => {
    expect(PANEL).toMatch(/sensors-diag-copy-json/);
    expect(PANEL).toMatch(/sensors-diag-copy-text/);
    expect(PANEL).toMatch(/sensors-diag-copy-curl/);
    expect(PANEL).toMatch(/sensors-diag-copy-powershell-ingest/);
    expect(PANEL).toMatch(/sensors-diag-download-json/);
    expect(PANEL).toMatch(/sensors-diag-download-text/);
  });

  it("renders local test history with clear/copy/download controls", () => {
    expect(PANEL).toMatch(/sensors-testbench-history\b/);
    expect(PANEL).toMatch(/sensors-testbench-history-clear/);
    expect(PANEL).toMatch(/sensors-testbench-history-copy-json/);
    expect(PANEL).toMatch(/sensors-testbench-history-download-json/);
    expect(PANEL).toMatch(/clears on refresh/);
  });

  it("renders canonical payload preview block with empty-state copy", () => {
    expect(PANEL).toMatch(/sensors-testbench-payload-preview\b/);
    expect(PANEL).toMatch(/sensors-testbench-payload-preview-empty/);
    expect(PANEL).toMatch(/buildRedactedPayloadPreview\(lastPayload\)/);
    expect(PANEL).toMatch(/No test payload sent yet/);
  });

  it("downloads use Blob + temporary object URL and revoke it", () => {
    expect(PANEL).toMatch(/new Blob\(/);
    expect(PANEL).toMatch(/URL\.createObjectURL/);
    expect(PANEL).toMatch(/URL\.revokeObjectURL/);
  });

  it("history is in-memory only — no localStorage/sessionStorage persistence", () => {
    expect(PANEL).not.toMatch(/localStorage[\s\S]{0,80}(history|reveal|token|payload)/i);
    expect(PANEL).not.toMatch(/sessionStorage[\s\S]{0,80}(history|reveal|token|payload)/i);
  });

  it("does not console.log token, curl, PS snippet, history, or export", () => {
    expect(PANEL).not.toMatch(/console\.(log|info|warn|error)\([^)]*(reveal|powershell|curl|cmd|history|export|payload)/i);
  });

  it("uses safeCopy fallback for clipboard", () => {
    expect(PANEL).toMatch(/Clipboard unavailable/);
    expect(PANEL).toMatch(/safeCopy/);
  });

  it("does not reference SERVICE_ROLE", () => {
    expect(PANEL).not.toMatch(/SERVICE_ROLE/);
  });

  it("test history and last payload are reset on tent change", () => {
    expect(PANEL).toMatch(/setHistory\(\[\]\)[\s\S]{0,200}setLastPayload\(null\)[\s\S]{0,200}\}, \[tentId\]\)/);
  });
});
