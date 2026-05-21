/**
 * Static tests for alert_events integration into Timeline and Grow Detail.
 *
 * Verifies:
 *   - Timeline fetches alert_events scoped by grow_id with parent alert join.
 *   - Timeline renders an Alert events section that links to /alerts/:alertId.
 *   - Timeline does not load alert events when no active grow is scoped.
 *   - Grow Detail merges alert_events into the recent activity feed.
 *   - Grow Detail orders the merged feed newest-first with deterministic
 *     tie-breakers.
 *   - Grow Detail computes scoped alert counts (open, critical, warning).
 *   - Grow Detail alert count card links to /alerts?growId=<growId>.
 *   - No new write paths, no ai-coach, no Action Queue writes,
 *     no service_role, no external-control strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { mergeRecent, type RecentItem } from "@/lib/growStatus";

const ROOT = resolve(__dirname, "../..");
const TIMELINE = readFileSync(
  resolve(ROOT, "src/pages/Timeline.tsx"),
  "utf8",
);
const HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useGrowDetailData.ts"),
  "utf8",
);
const GROW_DETAIL = readFileSync(
  resolve(ROOT, "src/pages/GrowDetail.tsx"),
  "utf8",
);
const GROW_STATUS = readFileSync(
  resolve(ROOT, "src/lib/growStatus.ts"),
  "utf8",
);

const GROW_BUNDLE = `${GROW_DETAIL}\n${HOOK}\n${GROW_STATUS}`;

// ---------------------------------------------------------------------------
// Timeline — alert_events fetch + render
// ---------------------------------------------------------------------------
describe("Timeline — alert_events fetch", () => {
  it("queries the alert_events table", () => {
    expect(TIMELINE).toMatch(/\.from\(\s*["']alert_events["']\s*\)/);
  });

  it("filters by the active grow_id", () => {
    expect(TIMELINE).toMatch(
      /\.from\(\s*["']alert_events["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*activeGrowId\s*\)/,
    );
  });

  it("selects required columns and joins parent alert (title/severity/metric/status)", () => {
    expect(TIMELINE).toMatch(
      /alert_events["']\s*\)\s*\.select\(\s*["'][^"']*event_type[^"']*previous_status[^"']*new_status[^"']*note[^"']*created_at[^"']*alert:alerts\(title,severity,metric,status\)/,
    );
  });

  it("orders newest-first at the DB layer", () => {
    expect(TIMELINE).toMatch(
      /alert_events[\s\S]{0,400}\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    );
  });

  it("does not load alert events when no grow is active", () => {
    // load() short-circuits and resets state when activeGrowId is missing.
    expect(TIMELINE).toMatch(
      /if\s*\(\s*!user\s*\|\|\s*!activeGrowId\s*\)\s*\{[\s\S]{0,200}setAlertEvents\(\[\]\)/,
    );
  });
});

describe("Timeline — Alert events section", () => {
  it("renders a clearly labeled section", () => {
    expect(TIMELINE).toMatch(/aria-label=\s*["']Alert events["']/);
    expect(TIMELINE).toMatch(/Alert events/);
  });

  it("links each event row to /alerts/:alertId via alertDetailPath", () => {
    expect(TIMELINE).toMatch(/to=\{alertDetailPath\(e\.alert_id\)\}/);
  });

  it("renders previous_status → new_status, title, metric, note, created_at", () => {
    expect(TIMELINE).toMatch(/e\.previous_status[\s\S]{0,40}e\.new_status/);
    expect(TIMELINE).toMatch(/e\.alert\?\.title/);
    expect(TIMELINE).toMatch(/e\.alert\?\.metric/);
    expect(TIMELINE).toMatch(/\{e\.note\}/);
    expect(TIMELINE).toMatch(/e\.created_at/);
  });

  it("supports all alert event_type labels", () => {
    for (const t of [
      "created",
      "acknowledged",
      "resolved",
      "dismissed",
      "reopened",
    ]) {
      expect(TIMELINE).toMatch(new RegExp(`["']${t}["']`));
    }
  });

  it("section returns null when there are no events", () => {
    const idx = TIMELINE.indexOf("function AlertEventsSection");
    expect(idx).toBeGreaterThan(-1);
    const body = TIMELINE.slice(idx, idx + 400);
    expect(body).toMatch(/if\s*\(\s*!events\?\.length\s*\)\s*return\s+null/);
  });

  it("is read-only: no onClick / update / delete handlers in the section", () => {
    const start = TIMELINE.indexOf("function AlertEventsSection");
    const section = TIMELINE.slice(start);
    expect(section).not.toMatch(/onClick=/);
    expect(section).not.toMatch(/\.update\(/);
    expect(section).not.toMatch(/\.delete\(/);
    expect(section).not.toMatch(/EntryEditDialog/);
  });
});

// ---------------------------------------------------------------------------
// Grow Detail — alert_events in recent activity, alert counts
// ---------------------------------------------------------------------------
describe("Grow Detail — alert events in recent activity", () => {
  it("fetches latest 5 alert_events by grow_id, created_at desc", () => {
    expect(HOOK).toMatch(
      /\.from\(\s*["']alert_events["']\s*\)[\s\S]{0,400}\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]{0,200}\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)[\s\S]{0,80}\.limit\(\s*5\s*\)/,
    );
  });

  it("resolves parent alerts (title/severity/metric/status) via .in()", () => {
    expect(HOOK).toMatch(
      /\.from\(\s*["']alerts["']\s*\)[\s\S]{0,200}\.select\(\s*["']id,title,severity,metric,status["']\s*\)[\s\S]{0,80}\.in\(\s*["']id["']\s*,\s*alertIds\s*\)/,
    );
  });

  it("maps each alert event to a RecentItem with kind alert_event + href", () => {
    expect(HOOK).toMatch(/kind:\s*["']alert_event["']/);
    expect(HOOK).toMatch(/href:\s*alertDetailPath\(e\.alert_id\)/);
  });

  it("Grow Detail renders the Alert Event label", () => {
    expect(GROW_DETAIL).toContain("Alert Event");
  });

  it("Grow Detail still renders Diary Entry and Action Queue Event labels", () => {
    expect(GROW_DETAIL).toContain("Diary Entry");
    expect(GROW_DETAIL).toContain("Action Queue Event");
  });
});

describe("mergeRecent — newest-first with deterministic tie-breakers", () => {
  it("orders by ts descending", () => {
    const items: RecentItem[] = [
      { id: "a", kind: "diary", ts: "2025-01-01T00:00:00Z", title: "old" },
      { id: "b", kind: "diary", ts: "2025-06-01T00:00:00Z", title: "new" },
    ];
    expect(mergeRecent(items).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("breaks ts ties by kind, then by id", () => {
    const ts = "2025-06-01T00:00:00Z";
    const items: RecentItem[] = [
      { id: "z", kind: "diary", ts, title: "d" },
      { id: "y", kind: "alert_event", ts, title: "al" },
      { id: "x", kind: "action_event", ts, title: "aq" },
      { id: "w", kind: "action_event", ts, title: "aq2" },
    ];
    expect(mergeRecent(items).map((i) => i.id)).toEqual(["w", "x", "y", "z"]);
  });
});

describe("Grow Detail — scoped alert counts", () => {
  it("counts open alerts via countFrom('alerts', status=open)", () => {
    expect(HOOK).toMatch(
      /countFrom\(\s*["']alerts["'][\s\S]{0,200}["']status["'][\s\S]{0,40}["']open["']/,
    );
  });

  it("counts critical open alerts (status=open, severity=critical)", () => {
    expect(HOOK).toMatch(
      /countFrom\(\s*["']alerts["'][\s\S]{0,300}["']severity["'][\s\S]{0,40}["']critical["']/,
    );
  });

  it("counts warning open alerts (status=open, severity=warning)", () => {
    expect(HOOK).toMatch(
      /countFrom\(\s*["']alerts["'][\s\S]{0,300}["']severity["'][\s\S]{0,40}["']warning["']/,
    );
  });

  it("exposes alertsOpen / alertsCritical / alertsWarning on counts", () => {
    expect(HOOK).toMatch(/alertsOpen:\s*CountValue/);
    expect(HOOK).toMatch(/alertsCritical:\s*CountValue/);
    expect(HOOK).toMatch(/alertsWarning:\s*CountValue/);
  });

  it("Grow Detail Alerts hub card links to alertsPath(growId)", () => {
    expect(GROW_DETAIL).toMatch(/to=\{alertsPath\(growId\)\}/);
    expect(GROW_DETAIL).toMatch(/title="Alerts"/);
    expect(GROW_DETAIL).toMatch(/count=\{counts\.alertsOpen\}/);
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------
describe("alert_events integration safety", () => {
  it("Timeline introduces no new write path for alert events", () => {
    // Allowlist: only one .from('alert_events') and it is followed by .select.
    const m = TIMELINE.match(/from\(["']alert_events["']\)\.(\w+)/);
    expect(m?.[1]).toBe("select");
    expect(TIMELINE).not.toMatch(/alert_events["']\)[^;]{0,200}\.insert\(/);
    expect(TIMELINE).not.toMatch(/alert_events["']\)[^;]{0,200}\.update\(/);
    expect(TIMELINE).not.toMatch(/alert_events["']\)[^;]{0,200}\.delete\(/);
  });

  it("Grow Detail hook introduces no new write path for alert events", () => {
    const m = HOOK.match(/from\(["']alert_events["']\)\.(\w+)/);
    expect(m?.[1]).toBe("select");
    expect(HOOK).not.toMatch(/alert_events["']\)[^;]{0,200}\.insert\(/);
    expect(HOOK).not.toMatch(/alert_events["']\)[^;]{0,200}\.update\(/);
    expect(HOOK).not.toMatch(/alert_events["']\)[^;]{0,200}\.delete\(/);
  });

  it("no ai-coach call introduced in either file", () => {
    expect(TIMELINE).not.toMatch(/ai-coach/i);
    expect(HOOK).not.toMatch(/ai-coach/i);
    expect(TIMELINE).not.toMatch(/functions\.invoke/);
    expect(HOOK).not.toMatch(/functions\.invoke/);
  });

  it("no Action Queue writes introduced", () => {
    expect(TIMELINE).not.toMatch(/action_queue["']\)[^;]{0,200}\.insert\(/);
    expect(TIMELINE).not.toMatch(/action_queue["']\)[^;]{0,200}\.update\(/);
    expect(HOOK).not.toMatch(/action_queue["']\)[^;]{0,200}\.insert\(/);
    expect(HOOK).not.toMatch(/action_queue["']\)[^;]{0,200}\.update\(/);
  });

  it("no service_role or external-control surface", () => {
    expect(GROW_BUNDLE).not.toMatch(/service_role/i);
    expect(TIMELINE).not.toMatch(/service_role/i);
    expect(GROW_BUNDLE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
    expect(TIMELINE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b/i,
    );
  });
});
