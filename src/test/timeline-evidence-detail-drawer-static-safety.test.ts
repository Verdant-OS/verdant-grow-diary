/**
 * Static safety scan for the Timeline Evidence Detail Drawer slice.
 *
 * The pure helper and UI component must not introduce any writes,
 * AI/model calls, device control, Action Queue/alert/sensor writes,
 * service_role usage, raw_payload rendering, or bridge/token leaks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/lib/timelineEvidenceDetailViewModel.ts",
  "src/components/TimelineEvidenceDetailDrawer.tsx",
];

const FORBIDDEN: RegExp[] = [
  /\.insert\(/,
  /\.update\(/,
  /\.delete\(/,
  /\.upsert\(/,
  /\.rpc\(/,
  /functions\s*\.\s*invoke\s*\(/,
  /supabase\.from\(/,
  /\bai-doctor-review\b/,
  /\bai-coach\b/,
  /sensor-ingest-webhook/,
  /sensor_readings/,
  /action_queue/,
  /alert_events/,
  /service[_-]?role/i,
  /PASSKEY/,
  /Authorization\s*:/,
  /Bearer\s+[A-Za-z0-9]/,
  /\bvbt_[A-Za-z0-9]/,
  /bridge[_-]?token/i,
  /localhost:\d+/,
  /127\.0\.0\.1/,
  /\b(turn|activate)\b.*\b(fan|light|pump|heater|humidifier|dehumidifier)\b/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

describe("Timeline evidence detail drawer — static safety", () => {
  for (const path of FILES) {
    const body = readFileSync(join(process.cwd(), path), "utf8");
    it(`${path} has no unsafe patterns`, () => {
      for (const re of FORBIDDEN) expect(body, `${path} matched ${re}`).not.toMatch(re);
    });
    it(`${path} has no fetch / POST / XHR calls`, () => {
      expect(body).not.toMatch(/\bfetch\s*\(/);
      expect(body).not.toMatch(/XMLHttpRequest/);
      expect(body).not.toMatch(/method:\s*["']POST["']/);
    });
  }

  it("view-model helper is DOM-free / React-free", () => {
    const body = readFileSync(
      join(process.cwd(), "src/lib/timelineEvidenceDetailViewModel.ts"),
      "utf8",
    );
    expect(body).not.toMatch(/from\s+["']react["']/);
    expect(body).not.toMatch(/\bdocument\s*\./);
    expect(body).not.toMatch(/\bwindow\s*\./);
  });

  it("view-model does not reference raw_payload as a readable field", () => {
    const body = readFileSync(
      join(process.cwd(), "src/lib/timelineEvidenceDetailViewModel.ts"),
      "utf8",
    );
    // The literal token raw_payload must not appear at all in the helper.
    expect(body).not.toMatch(/raw_payload/);
  });
});
