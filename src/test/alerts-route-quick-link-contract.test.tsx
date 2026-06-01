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
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { alertsPath } from "@/lib/routes";
import { buildPlantQuickStatusView } from "@/lib/plantQuickStatusRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const APP = read("src/App.tsx");
const ALERTS = read("src/pages/Alerts.tsx");

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
      /Verdant will show environment or grow warnings here/,
    );
  });

  it("error state surfaces calm retry guidance with a Retry control", () => {
    expect(ALERTS).toMatch(/role="alert"/);
    expect(ALERTS).toMatch(/Check your connection and try again/);
    expect(ALERTS).toMatch(/onClick=\{\(\) => reload\(\)\}/);
    expect(ALERTS).toMatch(/>\s*Retry\s*</);
  });

  it("alert rows surface severity, status, title, reason, and timestamp", () => {
    expect(ALERTS).toMatch(/\{a\.severity\}/);
    expect(ALERTS).toMatch(/\{a\.status\}/);
    expect(ALERTS).toMatch(/\{a\.title\}/);
    expect(ALERTS).toMatch(/\{a\.reason\}/);
    expect(ALERTS).toMatch(/formatDistanceToNow\(new Date\(a\.first_seen_at\)/);
  });

  it("copy does not imply automation, notifications, email, or scheduled reminders", () => {
    expect(ALERTS).not.toMatch(
      /\b(notify|notification|email\s+you|we'?ll\s+email|reminder|remind\s+you|scheduled)\b/i,
    );
    expect(ALERTS).not.toMatch(/autopilot|auto[\s-]?execute|auto[\s-]?run/i);
  });


  it("page scaffolding does not leak token/raw_payload/provenance/service_role copy", () => {
    const blob = ALERTS.toLowerCase();
    expect(blob).not.toContain("service_role");
    expect(blob).not.toContain("raw_payload");
    expect(blob).not.toContain("provenance");
    expect(blob).not.toContain("bearer ");
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
