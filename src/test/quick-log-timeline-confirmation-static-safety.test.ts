/**
 * Quick Log "View in Timeline" confirmation — static safety scan.
 *
 * The confirmation surface (sheet + nav helper) must not introduce any
 * AI invocation, Edge Function call, Action Queue / alert / sensor /
 * AI session write, or device-control imperative. It must also not
 * leak secrets.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/lib/quickLogTimelineNavigationTarget.ts",
  "src/lib/timelineAnchorNavigation.ts",
  "src/components/QuickLogV2Sheet.tsx",
];

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("QuickLog timeline confirmation — static safety", () => {
  for (const rel of FILES) {
    const body = src(rel);

    it(`${rel} has no AI / Edge Function invocation`, () => {
      expect(body).not.toMatch(/functions\s*\.\s*invoke\s*\(/);
      expect(body).not.toMatch(/\bai-doctor-review\b/);
      expect(body).not.toMatch(/\bai-coach\b/);
      expect(body).not.toMatch(/sensor-ingest-webhook/);
    });

    it(`${rel} writes no alerts / action_queue / sensor_readings / ai_doctor_sessions`, () => {
      expect(body).not.toMatch(/from\(["']alerts["']\)/);
      expect(body).not.toMatch(/from\(["']alert_events["']\)/);
      expect(body).not.toMatch(/from\(["']action_queue["']\)/);
      expect(body).not.toMatch(/from\(["']action_queue_events["']\)/);
      expect(body).not.toMatch(/from\(["']sensor_readings["']\)/);
      expect(body).not.toMatch(/from\(["']ai_doctor_sessions["']\)/);
    });

    it(`${rel} has no device-control imperatives`, () => {
      expect(body).not.toMatch(
        /\bturn (on|off) (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
      );
      expect(body).not.toMatch(
        /\bactivate (the )?(fan|light|pump|heater|humidifier|dehumidifier)/i,
      );
    });

    it(`${rel} has no secrets / tokens / bridge URLs`, () => {
      expect(body).not.toMatch(/PASSKEY/);
      expect(body).not.toMatch(/service[_-]?role/i);
      expect(body).not.toMatch(/Authorization\s*:/);
      expect(body).not.toMatch(/\bvbt_[A-Za-z0-9]/);
      expect(body).not.toMatch(/bridge[_-]?token/i);
    });
  }

  it("sheet still calls applyQuickLogV2Refresh on success", () => {
    const body = src("src/components/QuickLogV2Sheet.tsx");
    expect(body).toMatch(/applyQuickLogV2Refresh\s*\(\s*queryClient/);
  });

  it("sheet exposes the View in Timeline action via the toast", () => {
    const body = src("src/components/QuickLogV2Sheet.tsx");
    expect(body).toMatch(/QUICK_LOG_TIMELINE_CTA_LABEL/);
    expect(body).toMatch(/showTimelineConfirmation\(/);
  });

  it("photo success path also surfaces the CTA via showTimelineConfirmation", () => {
    const body = src("src/components/QuickLogV2Sheet.tsx");
    // Both the standard/photo success path and the feeding path must
    // route success messaging through showTimelineConfirmation.
    const matches = body.match(/showTimelineConfirmation\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/"Log and photo saved"|'Log and photo saved'/);
  });

  it("inline failed-save Retry reuses handleSave (no alternate save fn)", () => {
    const body = src("src/components/QuickLogV2Sheet.tsx");
    expect(body).toMatch(/data-testid="qlv2-save-retry"/);
    expect(body).toMatch(/onClick=\{handleSave\}/);
    // No new save handlers introduced for retry.
    expect(body).not.toMatch(/retryHandleSave|handleRetrySave|backgroundRetry/);
  });

  it("touched files do not introduce raw mutations or bridge POSTs", () => {
    for (const rel of FILES) {
      const body = src(rel);
      // Only quicklog_save_manual rpc is allowed and it lives in the hook,
      // not in these files — assert no .rpc / fetch-to-bridge appears here.
      expect(body).not.toMatch(/\.rpc\(/);
      expect(body).not.toMatch(/fetch\(["'`]https?:\/\/[^"'`]*bridge/i);
      expect(body).not.toMatch(/raw_payload/);
      expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
    }
  });
});

