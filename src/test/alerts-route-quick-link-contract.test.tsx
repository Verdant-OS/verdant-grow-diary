/**
 * Alerts route ↔ Plant Detail quick-status link contract.
 *
 * Strictly read-only static checks. No new writes, no hooks invoked here.
 *
 * Goals:
 *  1. The Plant Detail quick-status Alerts link target matches the registered
 *     Alerts route, so the existing read-only route opens with grow scope.
 *  2. The route exposes the required UI states (loading / unavailable /
 *     empty / data) without leaking IDs, tokens, or provenance markers in
 *     the page-level scaffolding.
 *  3. Safe degradation copy is present for the unavailable/empty branches.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  alertsPath,
  alertDetailPath,
  actionQueueAlertContextPath,
} from "@/lib/routes";
import { buildPlantQuickStatusView } from "@/lib/plantQuickStatusRules";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import {
  scanForLeakedTerms,
  DEFAULT_FORBIDDEN_LEAK_TERMS,
  DEFAULT_ALLOWED_LEAK_IDENTIFIERS,
} from "./helpers/sourceLeakScanTestHelper";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const APP = read("src/App.tsx");
const ALERTS = read("src/pages/Alerts.tsx");

vi.mock("@/components/AlertsAutoPersistForGrow", () => ({ default: () => null }));

/**
 * Reduce a concrete href (possibly with query string + concrete ids) to the
 * manifest-shaped pattern. Examples:
 *   /alerts?growId=grow-1        → /alerts
 *   /alerts/abc-123              → /alerts/:alertId
 *   /actions?alert=abc           → /actions
 *
 * We do NOT invent params; we map any path segment that follows
 * `/alerts/` or `/actions/` to its manifest segment name.
 */
function toManifestPattern(href: string): string {
  const base = href.split("?")[0].split("#")[0];
  if (/^\/alerts\/[^/]+$/.test(base)) return "/alerts/:alertId";
  if (/^\/actions\/[^/]+$/.test(base)) return "/actions/:actionId";
  return base;
}

describe("Alerts route — quick link contract", () => {
  it("Plant Detail quick-status Alerts link target matches alertsPath helper", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      growId: "grow-1",
    });
    expect(v.alertsLink.disabled).toBe(false);
    expect(v.alertsLink.href).toBe(alertsPath("grow-1"));
    expect(v.alertsLink.href).toBe("/alerts?growId=grow-1");
  });

  it("Alerts route is registered in App.tsx", () => {
    expect(APP).toMatch(/path="\/alerts"\s+element=\{<Alerts\s*\/>\}/);
    expect(APP).toMatch(/import\s+Alerts\s+from\s+["']\.\/pages\/Alerts["']/);
  });

  it("Alerts route reads grow context from the URL (scoped grow hook)", () => {
    expect(ALERTS).toMatch(/useScopedGrow/);
    expect(ALERTS).toMatch(/urlGrowId/);
  });

  it("Alerts route renders loading, unavailable, empty, and data branches", () => {
    expect(ALERTS).toMatch(/status === "loading"/);
    expect(ALERTS).toMatch(/status === "unavailable"/);
    expect(ALERTS).toMatch(/Alerts unavailable/);
    expect(ALERTS).toMatch(/alerts\.length === 0/);
    expect(ALERTS).toMatch(/<EmptyState/);
  });

  it("empty state uses safety-pinned copy with calm helper text", () => {
    expect(ALERTS).toMatch(/No open alerts\./);
    expect(ALERTS).toMatch(
      /Alerts will appear when real or manual readings breach your grow targets/,
    );
  });

  it("error state surfaces calm retry guidance with a Retry control", () => {
    expect(ALERTS).toMatch(/role="alert"/);
    expect(ALERTS).toMatch(/Check your connection and try\s+again/);
    expect(ALERTS).toMatch(/onClick=\{\(\) => reload\(\)\}/);
    expect(ALERTS).toMatch(/>\s*Retry\s*</);
  });

  it("alert rows surface severity, status, title, reason, and timestamp", () => {
    expect(ALERTS).toMatch(/severityLabel/);
    expect(ALERTS).toMatch(/statusLabel/);
    expect(ALERTS).toMatch(/\{a\.title\}/);
    expect(ALERTS).toMatch(/\{a\.reason\}/);
    expect(ALERTS).toMatch(/formatAlertSeenLabel\(a\.first_seen_at\)/);
  });

  it("copy does not imply automation, notifications, email, or scheduled reminders", () => {
    expect(ALERTS).not.toMatch(
      /\b(notify|notification|email\s+you|we'?ll\s+email|reminder|remind\s+you|scheduled)\b/i,
    );
    expect(ALERTS).not.toMatch(/autopilot|auto[\s-]?execute|auto[\s-]?run/i);
  });


  it("page scaffolding does not leak token/raw_payload/provenance/service_role copy", () => {
    // Uses the shared scanner so the allow-list for <SensorSourceProvenanceBadge />
    // stays in one place (src/test/helpers/sourceLeakScanTestHelper.ts).
    const findings = scanForLeakedTerms(ALERTS);
    expect(findings).toEqual([]);
  });

  it("shared leak scanner allow-list stays minimal and explicit", () => {
    // Guard against silently growing the allow-list. Today the only safe
    // identifier we strip is the sensor-truth provenance badge.
    expect([...DEFAULT_ALLOWED_LEAK_IDENTIFIERS]).toEqual([
      "SensorSourceProvenanceBadge",
    ]);
    // Forbidden terms must still include the four standing safety strings.
    expect(new Set(DEFAULT_FORBIDDEN_LEAK_TERMS)).toEqual(
      new Set(["service_role", "raw_payload", "bearer ", "provenance"]),
    );
  });

  it("shared leak scanner still flags raw user-visible 'provenance' copy", () => {
    // Negative-control: if a future edit accidentally renders the word
    // outside the badge component, the scanner must catch it.
    const synthetic = `import X from "x";\nexport default () => <p>provenance</p>;`;
    const findings = scanForLeakedTerms(synthetic);
    expect(findings.map((f) => f.term)).toContain("provenance");
  });

  it("shared leak scanner still flags service_role / raw_payload / bearer leaks", () => {
    const synthetic = [
      'const k = "service_role";',
      'const p = "raw_payload";',
      'const h = "Bearer abc";',
    ].join("\n");
    const terms = scanForLeakedTerms(synthetic).map((f) => f.term).sort();
    expect(terms).toEqual(["bearer ", "raw_payload", "service_role"]);
  });
});

describe("Alerts route — quick-link targets resolve to manifest entries", () => {
  // Single source of truth for the alert quick-link surface this test owns.
  // Adding a new alert-shaped quick-link helper? Add it here so the snapshot
  // covers it and the manifest cross-check holds.
  const QUICK_LINKS: ReadonlyArray<{ name: string; href: string }> = [
    { name: "alertsPath()", href: alertsPath() },
    { name: "alertsPath(growId)", href: alertsPath("grow-1") },
    { name: "alertDetailPath(alertId)", href: alertDetailPath("alert-1") },
    {
      name: "actionQueueAlertContextPath(alertId)",
      href: actionQueueAlertContextPath("alert-1"),
    },
  ];

  it("every alert quick-link href reduces to a registered manifest path", () => {
    const manifestSet = new Set(APP_ROUTES.map((r) => r.path));
    const offenders = QUICK_LINKS.filter(
      (l) => !manifestSet.has(toManifestPattern(l.href)),
    );
    expect(offenders).toEqual([]);
  });

  it("alert quick-link manifest entries are gated as auth (not public)", () => {
    const offenders = QUICK_LINKS.filter((l) => {
      const entry = APP_ROUTES.find((r) => r.path === toManifestPattern(l.href));
      return !entry || entry.access !== "auth";
    });
    expect(offenders).toEqual([]);
  });

  it("alert quick-link manifest paths are mounted in App.tsx", () => {
    // App.tsx mounts the same path literal we resolve to. Catches the case
    // where a manifest entry is correct but the route was un-mounted.
    const offenders = QUICK_LINKS.filter(
      (l) => !APP.includes(`path="${toManifestPattern(l.href)}"`),
    );
    expect(offenders).toEqual([]);
  });

  it("snapshot: alert quick-link hrefs → manifest pattern (narrow, stable)", () => {
    const snapshot = QUICK_LINKS.map((l) => ({
      name: l.name,
      href: l.href,
      manifestPattern: toManifestPattern(l.href),
    }));
    // Intentionally narrow — only alert quick-link targets, not the whole
    // manifest. Update this snapshot only when an alert quick-link helper
    // is intentionally added/removed/renamed.
    expect(snapshot).toEqual([
      {
        name: "alertsPath()",
        href: "/alerts",
        manifestPattern: "/alerts",
      },
      {
        name: "alertsPath(growId)",
        href: "/alerts?growId=grow-1",
        manifestPattern: "/alerts",
      },
      {
        name: "alertDetailPath(alertId)",
        href: "/alerts/alert-1",
        manifestPattern: "/alerts/:alertId",
      },
      {
        name: "actionQueueAlertContextPath(alertId)",
        href: "/actions?alert=alert-1",
        manifestPattern: "/actions",
      },
    ]);
  });
});

describe("Alerts route — static safety", () => {
  it("does not introduce automation/device-control or scheduling strings in page chrome", () => {
    expect(ALERTS).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|relay|actuator|device_command|autopilot/i,
    );
    expect(ALERTS).not.toMatch(/calendar_events/);
    expect(ALERTS).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(ALERTS).not.toMatch(
      /\b(schedule|scheduled|scheduling)\s+(a\s+|the\s+|new\s+)?reminders?\b/i,
    );
  });

  it("does not invoke edge functions from the page module", () => {
    expect(ALERTS).not.toMatch(/functions\.invoke/);
  });
});
