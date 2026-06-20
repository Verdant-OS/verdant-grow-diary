/**
 * timelineEvidenceFilterRules — static safety scan.
 *
 * The pure helper must not introduce any DB / network / AI / device /
 * Action Queue / alert side effects, and must not render or search
 * over secret-bearing fields.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = "src/lib/timelineEvidenceFilterRules.ts";
const body = readFileSync(join(process.cwd(), FILE), "utf8");

describe("timelineEvidenceFilterRules — static safety", () => {
  it("has no Supabase / fetch / writes", () => {
    expect(body).not.toMatch(/\.insert\(/);
    expect(body).not.toMatch(/\.update\(/);
    expect(body).not.toMatch(/\.delete\(/);
    expect(body).not.toMatch(/\.upsert\(/);
    expect(body).not.toMatch(/\.rpc\(/);
    expect(body).not.toMatch(/functions\s*\.\s*invoke\s*\(/);
    expect(body).not.toMatch(/from\(["'][a-z_]+["']\)/);
    expect(body).not.toMatch(/\bfetch\s*\(/);
  });

  it("has no AI / Edge / device / alert / action_queue / sensor writes", () => {
    expect(body).not.toMatch(/\bai-doctor-review\b/);
    expect(body).not.toMatch(/\bai-coach\b/);
    expect(body).not.toMatch(/sensor-ingest-webhook/);
    expect(body).not.toMatch(/action_queue/);
    expect(body).not.toMatch(/alert_events/);
    expect(body).not.toMatch(/sensor_readings/);
    expect(body).not.toMatch(
      /\b(turn|activate)\b.*\b(fan|light|pump|heater|humidifier|dehumidifier)\b/i,
    );
  });

  it("has no secrets / token / bridge references", () => {
    expect(body).not.toMatch(/PASSKEY/);
    expect(body).not.toMatch(/service[_-]?role/i);
    expect(body).not.toMatch(/Authorization\s*:/);
    expect(body).not.toMatch(/\bvbt_[A-Za-z0-9]/);
    expect(body).not.toMatch(/bridge[_-]?token/i);
    expect(body).not.toMatch(/raw_payload/);
    expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
  });

  it("limits keyword search to a small allow-list of safe display keys", () => {
    // The helper's allow-list must remain explicit and tiny so future
    // edits can't silently widen the search scope into raw payloads.
    expect(body).toMatch(/SAFE_DETAIL_TEXT_KEYS\s*=\s*\[\s*"plant_name"\s*,\s*"stage"\s*\]/);
  });

  it("is React/router/DOM-free (pure helper)", () => {
    expect(body).not.toMatch(/from\s+["']react["']/);
    expect(body).not.toMatch(/from\s+["']react-router/);
    expect(body).not.toMatch(/\bdocument\s*\./);
    expect(body).not.toMatch(/\bwindow\s*\./);
  });
});
