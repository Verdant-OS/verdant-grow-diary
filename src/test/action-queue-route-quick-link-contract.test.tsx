/**
 * Action Queue route ↔ Plant Detail quick-status link contract.
 *
 * Read-only static checks. No new writes, no hooks invoked here.
 *
 * Goals:
 *  1. The Plant Detail quick-status Pending Actions link target matches the
 *     registered Action Queue route, so the existing read-only entry point
 *     opens with grow scope.
 *  2. The route exposes the required UI states (loading / empty / data),
 *     scopes to grow context, and keeps copy approval-focused.
 *  3. No autopilot / device-execution language is implied anywhere in the
 *     page chrome, and no IDs/tokens/provenance leak via page strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { actionsPath } from "@/lib/routes";
import { buildPlantQuickStatusView } from "@/lib/plantQuickStatusRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const APP = read("src/App.tsx");
const ACTIONS = read("src/pages/ActionQueue.tsx");

describe("Action Queue route — quick link contract", () => {
  it("Plant Detail quick-status Pending Actions link target matches actionsPath helper", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      growId: "grow-1",
    });
    expect(v.actionsLink.disabled).toBe(false);
    expect(v.actionsLink.href).toBe(actionsPath("grow-1"));
    expect(v.actionsLink.href).toBe("/actions?growId=grow-1");
  });

  it("disabled link surfaces a 'connect to a grow' reason when grow context missing", () => {
    const v = buildPlantQuickStatusView({
      stage: "vegetation",
      timelineItems: [],
      growId: null,
    });
    expect(v.actionsLink.disabled).toBe(true);
    expect(v.actionsLink.href).toBeNull();
    expect(v.actionsLink.disabledReason ?? "").toMatch(/grow/i);
  });

  it("Action Queue route is registered in App.tsx (canonical + legacy alias)", () => {
    expect(APP).toMatch(/path="\/actions"\s+element=\{<ActionQueue\s*\/>\}/);
    expect(APP).toMatch(/import\s+ActionQueue\s+from\s+["']\.\/pages\/ActionQueue["']/);
    // Legacy /action-queue alias must still redirect to canonical /actions.
    expect(APP).toMatch(/path="\/action-queue"\s+element=\{<Navigate\s+to="\/actions"/);
  });

  it("Action Queue route reads grow context from the URL (scoped grow hook)", () => {
    expect(ACTIONS).toMatch(/useScopedGrow/);
  });

  it("renders loading and empty states with the required copy", () => {
    // Loading branch exists.
    expect(ACTIONS).toMatch(/loading\s*\?\s*/);
    // Empty state copy is present.
    expect(ACTIONS).toMatch(/No pending actions\./);
  });

  it("keeps copy approval-focused and avoids autopilot/device execution language", () => {
    expect(ACTIONS).toMatch(/approval-gated|approval[- ]required|Review/i);
    expect(ACTIONS).not.toMatch(/autopilot/i);
    expect(ACTIONS).not.toMatch(
      /\bauto[- ]?execute|\bauto[- ]?run|actuate|relay|device_command|mqtt|home[\s_-]?assistant|pi[\s_-]?bridge/i,
    );
  });

  it("page chrome does not leak token/raw_payload/provenance/service_role copy", () => {
    const blob = ACTIONS.toLowerCase();
    expect(blob).not.toContain("service_role");
    expect(blob).not.toContain("raw_payload");
    expect(blob).not.toContain("bearer ");
  });
});

describe("Action Queue route — static safety", () => {
  it("does not introduce notifications/email/scheduling/calendar strings in page chrome", () => {
    expect(ACTIONS).not.toMatch(/calendar_events/);
    expect(ACTIONS).not.toMatch(/resend|sendgrid|mailgun|postmark|twilio/i);
    expect(ACTIONS).not.toMatch(
      /\b(schedule|scheduled|scheduling)\s+(a\s+|the\s+|new\s+)?reminders?\b/i,
    );
  });

  it("does not invoke edge functions from the page module", () => {
    expect(ACTIONS).not.toMatch(/functions\.invoke/);
  });
});
