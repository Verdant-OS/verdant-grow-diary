import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = readFileSync(
  resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"),
  "utf8",
);

describe("SensorsTestbenchPanel export/history/copy static safety", () => {
  it("wires diagnostics JSON/text/curl copy buttons", () => {
    expect(PANEL).toMatch(/sensors-diag-copy-json/);
    expect(PANEL).toMatch(/sensors-diag-copy-text/);
    expect(PANEL).toMatch(/sensors-diag-copy-curl/);
  });

  it("renders local test history with clear button", () => {
    expect(PANEL).toMatch(/sensors-testbench-history\b/);
    expect(PANEL).toMatch(/sensors-testbench-history-clear/);
    expect(PANEL).toMatch(/clears on refresh/);
  });

  it("history is in-memory only — no localStorage/sessionStorage persistence", () => {
    expect(PANEL).not.toMatch(/localStorage[\s\S]{0,80}(history|reveal|token)/i);
    expect(PANEL).not.toMatch(/sessionStorage[\s\S]{0,80}(history|reveal|token)/i);
  });

  it("does not console.log token, curl, or PS snippet", () => {
    expect(PANEL).not.toMatch(/console\.(log|info|warn|error)\([^)]*(reveal|powershell|curl|cmd)/i);
  });

  it("uses safeCopy fallback for clipboard", () => {
    expect(PANEL).toMatch(/Clipboard unavailable/);
    expect(PANEL).toMatch(/safeCopy/);
  });

  it("does not reference SERVICE_ROLE", () => {
    expect(PANEL).not.toMatch(/SERVICE_ROLE/);
  });

  it("test history is reset on tent change", () => {
    expect(PANEL).toMatch(/setHistory\(\[\]\)[\s\S]{0,200}\}, \[tentId\]\)/);
  });
});
