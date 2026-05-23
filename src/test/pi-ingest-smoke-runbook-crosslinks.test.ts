import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const readmePath = resolve(root, "README.md");
const contractPath = resolve(root, "docs/pi-ingest-write-transaction-contract.md");
const runbookPath = resolve(root, "docs/pi-ingest-smoke-runbook.md");

describe("pi-ingest smoke runbook cross-links", () => {
  it("README.md exists", () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  it("README.md links to docs/pi-ingest-smoke-runbook.md", () => {
    const txt = readFileSync(readmePath, "utf8");
    expect(txt).toMatch(/docs\/pi-ingest-smoke-runbook\.md/);
  });

  it("README.md mentions the deployed pi-ingest smoke test", () => {
    const txt = readFileSync(readmePath, "utf8").toLowerCase();
    expect(
      txt.includes("pi-ingest deployed smoke") ||
        txt.includes("deployed pi-ingest smoke") ||
        txt.includes("pi-ingest smoke"),
    ).toBe(true);
  });

  it("docs/pi-ingest-write-transaction-contract.md exists", () => {
    expect(existsSync(contractPath)).toBe(true);
  });

  it("write transaction contract links to pi-ingest-smoke-runbook.md", () => {
    const txt = readFileSync(contractPath, "utf8");
    expect(txt).toMatch(/pi-ingest-smoke-runbook\.md/);
  });

  it("write transaction contract mentions post-deploy verification", () => {
    const txt = readFileSync(contractPath, "utf8").toLowerCase();
    expect(txt).toMatch(/post-deploy|after deploy/);
  });

  it("write transaction contract mentions replay/idempotency", () => {
    const txt = readFileSync(contractPath, "utf8").toLowerCase();
    expect(txt).toContain("replay");
    expect(txt).toContain("idempoten");
  });

  it("write transaction contract mentions tampered signature or unknown bridge", () => {
    const txt = readFileSync(contractPath, "utf8").toLowerCase();
    expect(
      txt.includes("tampered signature") || txt.includes("unknown bridge"),
    ).toBe(true);
  });

  it("referenced runbook file exists", () => {
    expect(existsSync(runbookPath)).toBe(true);
  });
});
