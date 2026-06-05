/**
 * Cloud Canary empty-state polish.
 *
 * Verifies:
 *  - When the preview view-model state is "empty", the operator panel shows
 *    a calm, specific empty-state block AND hides the export preview, meta,
 *    and download buttons (so the operator does not see misleading
 *    "Download Fixture Summary" affordances with no data).
 *  - Copy contains no banned source-honesty words.
 *  - The empty-state region exposes no MAC/UUID (shared regexes reused).
 *  - When the panel is rendered with the real fixtures (populated branch),
 *    the export-meta + downloads STILL render — no regression.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAC_RE,
  UUID_RE,
} from "./operator-ecowitt-cloud-canary-per-fixture-table.test";

const BANNED = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
  "live data",
  "live feed",
];

async function renderPanelHtml(): Promise<string> {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { CloudCanaryPreviewPanel } = await import(
    "@/pages/OperatorEcowittCanary"
  );
  return renderToString(React.createElement(CloudCanaryPreviewPanel));
}

describe("Cloud Canary empty-state — populated regression (real fixtures)", () => {
  it("renders export preview, meta, and download buttons when fixtures are present", async () => {
    const html = await renderPanelHtml();
    expect(html).toContain('data-testid="cloud-canary-per-fixture-table"');
    expect(html).toContain('data-testid="cloud-canary-export-preview"');
    expect(html).toContain('data-testid="cloud-canary-export-meta"');
    expect(html).toContain('data-testid="download-cloud-canary-summary-csv"');
    expect(html).toContain('data-testid="download-cloud-canary-summary-json"');
    expect(html).not.toContain('data-testid="cloud-canary-empty-state"');
  });
});

describe("Cloud Canary empty-state — forced empty view-model", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/ecowittCloudCanaryViewModel", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/ecowittCloudCanaryViewModel")
      >("@/lib/ecowittCloudCanaryViewModel");
      return {
        ...actual,
        buildCloudCanaryPreviewViewModel: () => ({
          state: "empty" as const,
          is_empty: true,
          rows: [],
          suspicious_flag_codes: [] as never[],
          missing_metric_codes: [] as never[],
        }),
      };
    });
  });
  afterEach(() => {
    vi.doUnmock("@/lib/ecowittCloudCanaryViewModel");
    vi.resetModules();
  });

  async function renderEmpty(): Promise<string> {
    const React = await import("react");
    const { renderToString } = await import("react-dom/server");
    const mod = await import("@/pages/OperatorEcowittCanary");
    return renderToString(React.createElement(mod.CloudCanaryPreviewPanel));
  }

  it("renders the operator-friendly empty state block", async () => {
    const html = await renderEmpty();
    expect(html).toContain('data-testid="cloud-canary-empty-state"');
    expect(html).toContain('data-preview-state="empty"');
    expect(html).toContain("No canary preview to show yet");
    expect(html).toContain(
      "No file is written until you choose a download option.",
    );
  });

  it("hides the export preview, meta, and download buttons in empty state", async () => {
    const html = await renderEmpty();
    expect(html).not.toContain('data-testid="cloud-canary-export-preview"');
    expect(html).not.toContain('data-testid="cloud-canary-export-meta"');
    expect(html).not.toContain(
      'data-testid="download-cloud-canary-summary-csv"',
    );
    expect(html).not.toContain(
      'data-testid="download-cloud-canary-summary-json"',
    );
    expect(html).not.toContain('data-testid="cloud-canary-per-fixture-table"');
  });

  it("empty-state region contains no banned words and no MAC/UUID", async () => {
    const html = await renderEmpty();
    const startIdx = html.indexOf('data-testid="cloud-canary-empty-state"');
    expect(startIdx).toBeGreaterThan(-1);
    // Capture the empty-state block plus a generous tail to cover its content.
    const region = html.slice(startIdx, startIdx + 2000);
    expect(MAC_RE.test(region)).toBe(false);
    expect(UUID_RE.test(region)).toBe(false);
    const lower = region.toLowerCase();
    for (const w of BANNED) expect(lower).not.toContain(w);
  });
});
