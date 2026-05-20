/**
 * Tests for the immutable alert audit trail (`public.alert_events`) and the
 * UI wiring that appends events on lifecycle changes.
 *
 * Verifies:
 *   - Migration: table shape, FK cascade, RLS, no UPDATE/DELETE policy,
 *     CHECK constraints on event_type and previous_/new_status, ownership.
 *   - Library: logAlertEvent omits user_id, never updates/deletes audit rows.
 *   - Dashboard "Save alert" appends a 'created' event after a successful save,
 *     gated behind user click — no auto-save.
 *   - Alert Center transitions update status first, then append an event.
 *   - On audit-log failure the UI shows a warning (status change preserved).
 *   - Safety: no ai-coach call, no Action Queue writes, no external-control,
 *     no service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

const EVENTS_SQL = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .filter((s) => /public\.alert_events\b/i.test(s))
  .join("\n\n-- BOUNDARY --\n\n");

const ALERTS_LIB = readFileSync(
  resolve(__dirname, "../lib/alerts.ts"),
  "utf8",
);
const ALERT_PAGE = readFileSync(
  resolve(__dirname, "../pages/Alerts.tsx"),
  "utf8",
);
const DASHBOARD = readFileSync(
  resolve(__dirname, "../pages/Dashboard.tsx"),
  "utf8",
);
const USE_EVENTS_HOOK = readFileSync(
  resolve(__dirname, "../hooks/useAlertEvents.ts"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Migration shape
// ---------------------------------------------------------------------------
describe("alert_events migration", () => {
  it("creates public.alert_events", () => {
    expect(EVENTS_SQL).toMatch(/CREATE\s+TABLE[^;]*public\.alert_events/i);
  });

  it("user_id defaults to auth.uid()", () => {
    expect(EVENTS_SQL).toMatch(
      /user_id\s+uuid\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)/i,
    );
  });

  it("alert_id references alerts ON DELETE CASCADE", () => {
    expect(EVENTS_SQL).toMatch(
      /alert_id[^,]*REFERENCES\s+public\.alerts\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("grow_id references grows ON DELETE CASCADE", () => {
    expect(EVENTS_SQL).toMatch(
      /grow_id[^,]*REFERENCES\s+public\.grows\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("constrains event_type to the allowed lifecycle set", () => {
    expect(EVENTS_SQL).toMatch(
      /event_type\s+IN\s*\(\s*'created'\s*,\s*'acknowledged'\s*,\s*'resolved'\s*,\s*'dismissed'\s*,\s*'reopened'\s*\)/i,
    );
  });

  it("constrains previous_status and new_status to alert statuses when present", () => {
    expect(EVENTS_SQL).toMatch(
      /previous_status\s+IS\s+NULL\s+OR\s+previous_status\s+IN\s*\(\s*'open'\s*,\s*'acknowledged'\s*,\s*'resolved'\s*,\s*'dismissed'\s*\)/i,
    );
    expect(EVENTS_SQL).toMatch(
      /new_status\s+IS\s+NULL\s+OR\s+new_status\s+IN\s*\(\s*'open'\s*,\s*'acknowledged'\s*,\s*'resolved'\s*,\s*'dismissed'\s*\)/i,
    );
  });

  it("enables Row Level Security", () => {
    expect(EVENTS_SQL).toMatch(
      /ALTER\s+TABLE\s+public\.alert_events\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("declares SELECT and INSERT policies anchored on auth.uid() ownership", () => {
    expect(EVENTS_SQL).toMatch(
      /CREATE\s+POLICY[\s\S]*?alert_events[\s\S]*?FOR\s+SELECT/i,
    );
    expect(EVENTS_SQL).toMatch(
      /CREATE\s+POLICY[\s\S]*?alert_events[\s\S]*?FOR\s+INSERT/i,
    );
    expect(EVENTS_SQL).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    // INSERT WITH CHECK must require ownership of both the parent alert and grow.
    expect(EVENTS_SQL).toMatch(/FROM\s+public\.alerts\s+a/i);
    expect(EVENTS_SQL).toMatch(/a\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(EVENTS_SQL).toMatch(/FROM\s+public\.grows\s+g/i);
    expect(EVENTS_SQL).toMatch(/g\.user_id\s*=\s*auth\.uid\(\)/i);
  });

  it("declares NO UPDATE policy (append-only)", () => {
    expect(EVENTS_SQL).not.toMatch(
      /CREATE\s+POLICY[^;]*alert_events[^;]*FOR\s+UPDATE/i,
    );
  });

  it("declares NO DELETE policy (immutable history)", () => {
    expect(EVENTS_SQL).not.toMatch(
      /CREATE\s+POLICY[^;]*alert_events[^;]*FOR\s+DELETE/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Library wiring
// ---------------------------------------------------------------------------
describe("alerts lib audit helpers", () => {
  it("exports logAlertEvent and listAlertEvents", () => {
    expect(ALERTS_LIB).toMatch(/export\s+async\s+function\s+logAlertEvent/);
    expect(ALERTS_LIB).toMatch(/export\s+async\s+function\s+listAlertEvents/);
  });

  it("logAlertEvent payload never contains user_id", () => {
    const logIdx = ALERTS_LIB.indexOf("async function logAlertEvent");
    expect(logIdx).toBeGreaterThan(-1);
    const insertIdx = ALERTS_LIB.indexOf(".insert(payload)", logIdx);
    expect(insertIdx).toBeGreaterThan(logIdx);
    const block = ALERTS_LIB.slice(logIdx, insertIdx);
    // The payload-builder block must not assign user_id.
    expect(block).not.toMatch(/user_id\s*:/);
  });

  it("audit helpers never call update or delete on alert_events", () => {
    const eventsTableIdx = ALERTS_LIB.indexOf('"alert_events"');
    expect(eventsTableIdx).toBeGreaterThan(-1);
    // No .update or .delete chained from the alert_events table helper.
    const fromHelperIdx = ALERTS_LIB.indexOf("function alertEventsTable");
    const tail = ALERTS_LIB.slice(fromHelperIdx);
    expect(tail).not.toMatch(/alertEventsTable\(\)[\s\S]{0,200}\.update\(/);
    expect(tail).not.toMatch(/alertEventsTable\(\)[\s\S]{0,200}\.delete\(/);
  });
});

// ---------------------------------------------------------------------------
// Dashboard integration — save then log, manual-only, safe warning on log fail
// ---------------------------------------------------------------------------
describe("Dashboard save-alert audit wiring", () => {
  it("imports logAlertEvent from the alerts lib", () => {
    expect(DASHBOARD).toMatch(
      /import\s*\{[^}]*logAlertEvent[^}]*\}\s*from\s*["']@\/lib\/alerts["']/,
    );
  });

  it("appends a 'created' event after a successful saveAlert", () => {
    const idx = DASHBOARD.indexOf("Save alert");
    expect(idx).toBeGreaterThan(-1);
    const around = DASHBOARD.slice(Math.max(0, idx - 2000), idx + 200);
    expect(around).toMatch(/await\s+saveAlert/);
    expect(around).toMatch(/await\s+logAlertEvent/);
    expect(around).toMatch(/event_type\s*:\s*["']created["']/);
    expect(around).toMatch(/new_status\s*:\s*["']open["']/);
    // The logAlertEvent call must occur after the saveAlert call, not before.
    const saveIdx = around.indexOf("saveAlert");
    const logIdx = around.indexOf("logAlertEvent");
    expect(logIdx).toBeGreaterThan(saveIdx);
  });

  it("shows a warning toast if the audit log fails (status change preserved)", () => {
    const idx = DASHBOARD.indexOf("Save alert");
    const around = DASHBOARD.slice(Math.max(0, idx - 2000), idx + 200);
    expect(around).toMatch(/toast\.warning\(/);
    expect(around).toMatch(/audit log failed/i);
  });

  it("save+log only runs from an onClick handler (no auto-save)", () => {
    // logAlertEvent must appear inside a Save-alert onClick block, not at
    // module/component top level.
    const logIdx = DASHBOARD.indexOf("logAlertEvent(");
    expect(logIdx).toBeGreaterThan(-1);
    const before = DASHBOARD.slice(0, logIdx);
    const onClickIdx = before.lastIndexOf("onClick=");
    expect(onClickIdx).toBeGreaterThan(-1);
    // No `;` statement terminator should appear at the closing of the prior
    // function scope between onClick and logAlertEvent's `await`.
    const between = before.slice(onClickIdx);
    expect(between).toMatch(/await\s+saveAlert/);
  });
});

// ---------------------------------------------------------------------------
// Alert Center integration — status update first, then audit
// ---------------------------------------------------------------------------
describe("Alert Center audit wiring", () => {
  it("imports logAlertEvent and the useAlertEvents hook", () => {
    expect(ALERT_PAGE).toMatch(
      /import\s*\{[^}]*logAlertEvent[^}]*\}\s*from\s*["']@\/lib\/alerts["']/,
    );
    expect(ALERT_PAGE).toMatch(
      /from\s*["']@\/hooks\/useAlertEvents["']/,
    );
  });

  it("acknowledge/resolve/dismiss handlers append an audit event", () => {
    // The shared status-change runner must call the status op, then logAlertEvent.
    const handlerIdx = ALERT_PAGE.indexOf("runStatusChange");
    expect(handlerIdx).toBeGreaterThan(-1);
    const handlerBlock = ALERT_PAGE.slice(handlerIdx, handlerIdx + 1800);
    expect(handlerBlock).toMatch(/await\s+op\(\)/);
    expect(handlerBlock).toMatch(/await\s+logAlertEvent/);
    // op() (status update) must execute before logAlertEvent.
    const opIdx = handlerBlock.indexOf("await op()");
    const logIdx = handlerBlock.indexOf("logAlertEvent");
    expect(logIdx).toBeGreaterThan(opIdx);
  });

  it("audit log failure shows a warning toast and does not roll back status", () => {
    const handlerIdx = ALERT_PAGE.indexOf("runStatusChange");
    const handlerBlock = ALERT_PAGE.slice(handlerIdx, handlerIdx + 2200);
    expect(handlerBlock).toMatch(/toast\.warning\(/);
    expect(handlerBlock).toMatch(/audit log failed/i);
  });

  it("renders the per-alert history (AlertHistory) inside the card", () => {
    expect(ALERT_PAGE).toMatch(/<AlertHistory\s+alertId=/);
    expect(ALERT_PAGE).toMatch(/function\s+AlertHistory\(/);
  });

  it("useAlertEvents hook reads the audit table read-only via the lib", () => {
    expect(USE_EVENTS_HOOK).toMatch(/listAlertEvents/);
    expect(USE_EVENTS_HOOK).not.toMatch(/\.insert\(/);
    expect(USE_EVENTS_HOOK).not.toMatch(/\.update\(/);
    expect(USE_EVENTS_HOOK).not.toMatch(/\.delete\(/);
  });
});

// ---------------------------------------------------------------------------
// Safety constraints
// ---------------------------------------------------------------------------
describe("alert_events safety constraints", () => {
  it("alerts lib never calls ai-coach", () => {
    expect(ALERTS_LIB).not.toMatch(/ai-coach/i);
    expect(ALERTS_LIB).not.toMatch(/functions\.invoke/);
  });

  it("alerts lib never writes to action_queue", () => {
    expect(ALERTS_LIB).not.toMatch(/action_queue/);
  });

  it("alerts lib has no external-control / device-command strings", () => {
    expect(ALERTS_LIB).not.toMatch(/device[-_ ]command/i);
    expect(ALERTS_LIB).not.toMatch(/actuator/i);
    expect(ALERTS_LIB).not.toMatch(/external[-_ ]control/i);
  });

  it("alert_events migration grants nothing to service_role and does not assume it", () => {
    expect(EVENTS_SQL).not.toMatch(/GRANT[^;]*service_role/i);
    expect(EVENTS_SQL).not.toMatch(/SET\s+ROLE\s+service_role/i);
    expect(EVENTS_SQL).not.toMatch(/TO\s+service_role/i);
  });

  it("Alert Center page never writes to action_queue and never calls ai-coach", () => {
    expect(ALERT_PAGE).not.toMatch(/action_queue/);
    expect(ALERT_PAGE).not.toMatch(/ai-coach/i);
    expect(ALERT_PAGE).not.toMatch(/device[-_ ]command/i);
  });

  it("Dashboard save-alert block does not introduce ai-coach or action_queue writes", () => {
    const idx = DASHBOARD.indexOf("Save alert");
    const around = DASHBOARD.slice(Math.max(0, idx - 2000), idx + 200);
    expect(around).not.toMatch(/ai-coach/i);
    expect(around).not.toMatch(/action_queue/);
    expect(around).not.toMatch(/device[-_ ]command/i);
  });
});
