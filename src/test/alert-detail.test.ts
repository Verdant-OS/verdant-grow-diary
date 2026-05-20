/**
 * Tests for the Alert Detail page, route, and route builder.
 *
 * Verifies:
 *   - Route /alerts/:alertId is registered
 *   - alertDetailPath encodes the id
 *   - Alert Detail loads alert by id and handles not-found safely
 *   - Status mutations: update first, then append alert_events row
 *   - Audit-log failure surfaces a warning toast (no rollback)
 *   - Valid status action buttons render only when transition is valid
 *   - History renders from the alert_events lib helper
 *   - Context links to grow / tent / plant
 *   - Alert Center links each alert title to the detail page
 *   - No ai-coach call, no Action Queue write, no service_role,
 *     no external-control strings
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { alertDetailPath } from "@/lib/routes";

const DETAIL_PAGE = readFileSync(
  resolve(__dirname, "../pages/AlertDetail.tsx"),
  "utf8",
);
const ALERTS_PAGE = readFileSync(
  resolve(__dirname, "../pages/Alerts.tsx"),
  "utf8",
);
const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const ALERTS_LIB = readFileSync(
  resolve(__dirname, "../lib/alerts.ts"),
  "utf8",
);
const DASHBOARD = readFileSync(
  resolve(__dirname, "../pages/Dashboard.tsx"),
  "utf8",
);

describe("alertDetailPath builder", () => {
  it("emits /alerts/:id", () => {
    expect(alertDetailPath("abc")).toBe("/alerts/abc");
  });
  it("URL-encodes unsafe characters", () => {
    expect(alertDetailPath("a/b?c d")).toBe("/alerts/a%2Fb%3Fc%20d");
  });
  it("preserves canonical UUID shape", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(alertDetailPath(id)).toBe(`/alerts/${id}`);
  });
});

describe("AlertDetail route registration", () => {
  it("registers /alerts/:alertId in App.tsx", () => {
    expect(APP_TSX).toMatch(
      /path=["']\/alerts\/:alertId["']\s+element=\{<AlertDetail/,
    );
  });
  it("imports the AlertDetail page", () => {
    expect(APP_TSX).toMatch(/from\s+["']\.\/pages\/AlertDetail["']/);
  });
});

describe("AlertDetail page composition", () => {
  it("uses useParams to read alertId", () => {
    expect(DETAIL_PAGE).toMatch(/useParams<\{\s*alertId:\s*string\s*\}>/);
  });
  it("loads the alert by id via getAlertById (RLS-enforced read)", () => {
    expect(DETAIL_PAGE).toMatch(/getAlertById\(/);
  });
  it("handles a missing alert with a safe not-found state", () => {
    expect(DETAIL_PAGE).toMatch(/setStatus\(["']not_found["']\)/);
    expect(DETAIL_PAGE).toMatch(/Alert not found/);
  });
  it("renders the immutable history via the events hook", () => {
    expect(DETAIL_PAGE).toMatch(/useAlertEvents\(/);
    expect(DETAIL_PAGE).toMatch(/aria-label=["']Alert history["']/);
  });

  it("links grow_id to the grow detail page", () => {
    expect(DETAIL_PAGE).toMatch(/growDetailPath\(alert\.grow_id\)/);
  });
  it("links tent_id to /tents/:id when present", () => {
    expect(DETAIL_PAGE).toMatch(/\/tents\/\$\{encodeURIComponent\(alert\.tent_id\)\}/);
  });
  it("links plant_id to /plants/:id when present", () => {
    expect(DETAIL_PAGE).toMatch(/\/plants\/\$\{encodeURIComponent\(alert\.plant_id\)\}/);
  });

  it("shows acknowledge action only for open alerts", () => {
    expect(DETAIL_PAGE).toMatch(
      /alert\.status\s*===\s*["']open["'][\s\S]{0,400}Acknowledge/,
    );
  });
  it("shows resolve action for open or acknowledged alerts", () => {
    expect(DETAIL_PAGE).toMatch(
      /open["']\s*\|\|\s*alert\.status\s*===\s*["']acknowledged["'][\s\S]{0,400}Resolve/,
    );
  });
  it("shows dismiss action for open or acknowledged alerts", () => {
    expect(DETAIL_PAGE).toMatch(
      /open["']\s*\|\|\s*alert\.status\s*===\s*["']acknowledged["'][\s\S]{0,400}Dismiss/,
    );
  });
  it("shows reopen action for dismissed or resolved alerts", () => {
    expect(DETAIL_PAGE).toMatch(
      /dismissed["']\s*\|\|\s*alert\.status\s*===\s*["']resolved["'][\s\S]{0,400}Reopen/,
    );
  });
});

describe("AlertDetail status-change wiring", () => {
  it("status op runs before the audit log row is appended", () => {
    const handlerIdx = DETAIL_PAGE.indexOf("runStatusChange");
    expect(handlerIdx).toBeGreaterThan(-1);
    const handlerBlock = DETAIL_PAGE.slice(handlerIdx, handlerIdx + 2200);
    expect(handlerBlock).toMatch(/await\s+op\(\)/);
    expect(handlerBlock).toMatch(/await\s+logAlertEvent/);
    const opIdx = handlerBlock.indexOf("await op()");
    const logIdx = handlerBlock.indexOf("logAlertEvent");
    expect(logIdx).toBeGreaterThan(opIdx);
  });
  it("audit-log failure shows a warning toast and preserves the status change", () => {
    const handlerIdx = DETAIL_PAGE.indexOf("runStatusChange");
    const handlerBlock = DETAIL_PAGE.slice(handlerIdx, handlerIdx + 2200);
    expect(handlerBlock).toMatch(/toast\.warning\(/);
    expect(handlerBlock).toMatch(/audit log failed/i);
  });
});

describe("Alert Center links each alert to the detail route", () => {
  it("Alert Center imports alertDetailPath", () => {
    expect(ALERTS_PAGE).toMatch(/alertDetailPath/);
  });
  it("Alert Center renders a Link to the detail page", () => {
    expect(ALERTS_PAGE).toMatch(/to=\{alertDetailPath\(a\.id\)\}/);
  });
});

describe("reopenAlert helper (alerts lib)", () => {
  it("exports reopenAlert", () => {
    expect(ALERTS_LIB).toMatch(/export\s+async\s+function\s+reopenAlert/);
  });
  it("reopen clears acknowledged_at and resolved_at to satisfy CHECK constraints", () => {
    const idx = ALERTS_LIB.indexOf("function reopenAlert");
    const block = ALERTS_LIB.slice(idx, idx + 500);
    expect(block).toMatch(/status:\s*["']open["']/);
    expect(block).toMatch(/acknowledged_at:\s*null/);
    expect(block).toMatch(/resolved_at:\s*null/);
  });
  it("exports getAlertById that uses maybeSingle (safe not-found)", () => {
    expect(ALERTS_LIB).toMatch(/export\s+async\s+function\s+getAlertById/);
    const idx = ALERTS_LIB.indexOf("function getAlertById");
    const block = ALERTS_LIB.slice(idx, idx + 400);
    expect(block).toMatch(/\.maybeSingle\(\)/);
  });
});

describe("Dashboard saved-alert toast may link to the detail route", () => {
  it("imports alertDetailPath", () => {
    expect(DASHBOARD).toMatch(/alertDetailPath/);
  });
  it("references alertDetailPath in the Save alert success path (no auto-navigate)", () => {
    const idx = DASHBOARD.indexOf("Save alert");
    const around = DASHBOARD.slice(Math.max(0, idx - 2200), idx + 200);
    expect(around).toMatch(/alertDetailPath\(saved\.id\)/);
    expect(around).not.toMatch(/useNavigate/);
  });
});

describe("AlertDetail safety constraints", () => {
  it("never calls ai-coach", () => {
    expect(DETAIL_PAGE).not.toMatch(/ai-coach/i);
    expect(DETAIL_PAGE).not.toMatch(/functions\.invoke/);
  });
  it("never writes to action_queue", () => {
    expect(DETAIL_PAGE).not.toMatch(/action_queue/);
  });
  it("contains no external-control or device-command strings", () => {
    expect(DETAIL_PAGE).not.toMatch(/device[-_ ]command/i);
    expect(DETAIL_PAGE).not.toMatch(/actuator/i);
    expect(DETAIL_PAGE).not.toMatch(/external[-_ ]control/i);
  });
  it("does not use service_role", () => {
    expect(DETAIL_PAGE).not.toMatch(/service_role/i);
  });
});
