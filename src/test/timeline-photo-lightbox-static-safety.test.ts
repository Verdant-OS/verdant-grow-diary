/**
 * Static safety scan for the Timeline photo lightbox slice.
 *
 * The pure helper and UI component must not introduce any writes,
 * AI/model calls, device control, Action Queue/alert/sensor writes,
 * service_role usage, raw_payload rendering, or bridge/token leaks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "src/lib/timelinePhotoLightboxRules.ts",
  "src/components/TimelinePhotoLightbox.tsx",
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
  /raw_payload/,
  /service[_-]?role/i,
  /PASSKEY/,
  /Authorization\s*:/,
  /Bearer\s+[A-Za-z0-9]/,
  /\bvbt_[A-Za-z0-9]/,
  /bridge[_-]?token/i,
  /localhost:\d+/,
  /127\.0\.0\.1/,
  /\b(turn|activate)\b.*\b(fan|light|pump|heater|humidifier|dehumidifier)\b/i,
];

describe("Timeline photo lightbox — static safety", () => {
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

  it("rules helper is DOM-free / React-free", () => {
    const body = readFileSync(
      join(process.cwd(), "src/lib/timelinePhotoLightboxRules.ts"),
      "utf8",
    );
    expect(body).not.toMatch(/from\s+["']react["']/);
    expect(body).not.toMatch(/\bdocument\s*\./);
    expect(body).not.toMatch(/\bwindow\s*\./);
  });
});
