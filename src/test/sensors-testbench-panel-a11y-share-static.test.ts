import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL = readFileSync(
  resolve(__dirname, "../components/SensorsTestbenchPanel.tsx"),
  "utf8",
);

describe("SensorsTestbenchPanel a11y + share-modal static safety", () => {
  it("readiness badge link uses aria-label and the focus helper", () => {
    expect(PANEL).toMatch(/sensors-testbench-result-readiness-badge/);
    expect(PANEL).toMatch(/aria-label=\{validationAriaLabel\}/);
    expect(PANEL).toMatch(/focusValidationDetails\(\)/);
    expect(PANEL).toMatch(/href="#canonical-ingest-validation-details"/);
  });

  it("validation details section has stable id, ref, and tabIndex=-1", () => {
    expect(PANEL).toMatch(/id="canonical-ingest-validation-details"/);
    expect(PANEL).toMatch(/ref=\{validationDetailsRef\}/);
    expect(PANEL).toMatch(/tabIndex=\{-1\}/);
  });

  it("copy redacted button is labeled, gated, and uses copyRedactedInspector", () => {
    expect(PANEL).toMatch(/sensors-testbench-response-inspector-copy/);
    expect(PANEL).toMatch(/aria-label="Copy redacted response inspector summary"/);
    expect(PANEL).toMatch(/onClick=\{copyRedactedInspector\}/);
    expect(PANEL).toMatch(/disabled=\{!inspectorPlainText\}/);
  });

  it("copy redacted success message mentions redaction; failure copy is calm", () => {
    expect(PANEL).toMatch(/Copied redacted diagnostics summary\./);
    expect(PANEL).toMatch(/Sensitive values were redacted\./);
    expect(PANEL).toMatch(
      /Could not copy diagnostics summary\. You can select and copy manually\./,
    );
  });

  it("share diagnostics button opens a labeled dialog with bundle + readiness + summary", () => {
    expect(PANEL).toMatch(/sensors-testbench-share-open/);
    expect(PANEL).toMatch(/setShareOpen\(true\)/);
    expect(PANEL).toMatch(/sensors-testbench-share-modal/);
    expect(PANEL).toMatch(/sensors-testbench-share-bundle-filename/);
    expect(PANEL).toMatch(/sensors-testbench-share-readiness/);
    expect(PANEL).toMatch(/sensors-testbench-share-summary/);
    expect(PANEL).toMatch(/sensors-testbench-share-close/);
    expect(PANEL).toMatch(/aria-label="Close share diagnostics modal"/);
  });

  it("share modal pulls bundle/summary/inspector from shared helpers (no second redaction path)", () => {
    expect(PANEL).toMatch(/buildDiagnosticsShareModalState/);
    expect(PANEL).toMatch(/buildCanonicalValidationA11yLabel/);
    expect(PANEL).toMatch(/buildDiagnosticsBundleFilenamePreview/);
    expect(PANEL).toMatch(/formatSafeResponseInspectorPlainText/);
  });

  it("does not introduce new fetch/XHR network writes from the share modal", () => {
    // Share modal helpers should reuse existing download/copy paths only.
    const shareSection = PANEL.split("Share diagnostics")[1] ?? "";
    expect(shareSection).not.toMatch(/fetch\(/);
    expect(shareSection).not.toMatch(/XMLHttpRequest/);
    expect(shareSection).not.toMatch(/supabase\.functions\.invoke/);
  });
});
