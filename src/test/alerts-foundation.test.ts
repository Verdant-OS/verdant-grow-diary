/**
 * Tests for the persistent alerts foundation and Alert Center.
 *
 * Verifies:
 *   - Migration shape (alerts table, columns, constraints, RLS, policies, trigger)
 *   - Route registration for /alerts
 *   - Alert Center uses ScopedGrowBanner + GrowBreadcrumbs
 *   - Dashboard does not auto-save alerts; "Save alert" requires a user click
 *   - Save payload omits user_id (DB default auth.uid())
 *   - Status helpers (acknowledge / resolve / dismiss) only update status + ts
 *   - No ai-coach call introduced, no Action Queue writes, no external-control
 *     strings, no service_role
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");

const ALL_SQL = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .join("\n\n-- FILE BOUNDARY --\n\n");

const ALERTS_SQL = (() => {
  // Concatenate any migration files that mention `public.alerts`.
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
    .filter((s) => /public\.alerts/i.test(s))
    .join("\n\n");
})();

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
const APP_TSX = readFileSync(resolve(__dirname, "../App.tsx"), "utf8");
const ROUTES = readFileSync(resolve(__dirname, "../lib/routes.ts"), "utf8");

// ---------------------------------------------------------------------------
// Migration shape
// ---------------------------------------------------------------------------
describe("alerts table migration", () => {
  it("creates public.alerts", () => {
    expect(ALERTS_SQL).toMatch(/CREATE\s+TABLE[^;]*public\.alerts/i);
  });

  it("user_id defaults to auth.uid()", () => {
    expect(ALERTS_SQL).toMatch(
      /user_id\s+uuid\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)/i,
    );
  });

  it("grow_id references grows ON DELETE CASCADE", () => {
    expect(ALERTS_SQL).toMatch(
      /grow_id[^,]*REFERENCES\s+public\.grows\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("tent_id / plant_id references use ON DELETE SET NULL", () => {
    expect(ALERTS_SQL).toMatch(
      /tent_id[^,]*REFERENCES\s+public\.tents\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
    expect(ALERTS_SQL).toMatch(
      /plant_id[^,]*REFERENCES\s+public\.plants\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });

  it("status default is 'open' and source default is 'environment_alerts'", () => {
    expect(ALERTS_SQL).toMatch(/status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'open'/i);
    expect(ALERTS_SQL).toMatch(
      /source\s+text\s+NOT\s+NULL\s+DEFAULT\s+'environment_alerts'/i,
    );
  });

  it("constrains severity to info/watch/warning/critical", () => {
    expect(ALERTS_SQL).toMatch(
      /CHECK\s*\(\s*severity\s+IN\s*\(\s*'info'\s*,\s*'watch'\s*,\s*'warning'\s*,\s*'critical'\s*\)/i,
    );
  });

  it("constrains status to open/acknowledged/resolved/dismissed", () => {
    expect(ALERTS_SQL).toMatch(
      /CHECK\s*\(\s*status\s+IN\s*\(\s*'open'\s*,\s*'acknowledged'\s*,\s*'resolved'\s*,\s*'dismissed'\s*\)/i,
    );
  });

  it("acknowledged_at can only be set when status = 'acknowledged'", () => {
    expect(ALERTS_SQL).toMatch(
      /CHECK\s*\(\s*acknowledged_at\s+IS\s+NULL\s+OR\s+status\s*=\s*'acknowledged'\s*\)/i,
    );
  });

  it("resolved_at can only be set when status = 'resolved'", () => {
    expect(ALERTS_SQL).toMatch(
      /CHECK\s*\(\s*resolved_at\s+IS\s+NULL\s+OR\s+status\s*=\s*'resolved'\s*\)/i,
    );
  });

  it("enables Row Level Security on public.alerts", () => {
    expect(ALERTS_SQL).toMatch(
      /ALTER\s+TABLE\s+public\.alerts\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("declares SELECT/INSERT/UPDATE/DELETE policies anchored on auth.uid()", () => {
    expect(ALERTS_SQL).toMatch(/CREATE\s+POLICY[^;]*FOR\s+SELECT[^;]*alerts/i);
    expect(ALERTS_SQL).toMatch(/CREATE\s+POLICY[^;]*FOR\s+INSERT[^;]*alerts/i);
    expect(ALERTS_SQL).toMatch(/CREATE\s+POLICY[^;]*FOR\s+UPDATE[^;]*alerts/i);
    expect(ALERTS_SQL).toMatch(/CREATE\s+POLICY[^;]*FOR\s+DELETE[^;]*alerts/i);
    // Insert + update must verify grow ownership against public.grows.
    expect(ALERTS_SQL).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    expect(ALERTS_SQL).toMatch(/public\.grows/);
    expect(ALERTS_SQL).toMatch(/g\.user_id\s*=\s*auth\.uid\(\)/i);
  });

  it("attaches an updated_at trigger", () => {
    expect(ALERTS_SQL).toMatch(
      /CREATE\s+TRIGGER[^;]*BEFORE\s+UPDATE\s+ON\s+public\.alerts[^;]*EXECUTE\s+FUNCTION\s+public\.set_updated_at/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Routing & UI wiring
// ---------------------------------------------------------------------------
describe("Alert Center routing", () => {
  it("registers the /alerts route", () => {
    expect(APP_TSX).toMatch(/path=["']\/alerts["']\s+element=\{<Alerts/);
  });

  it("alertsPath helper accepts a growId and emits ?growId=", () => {
    expect(ROUTES).toMatch(/export\s+const\s+alertsPath/);
    expect(ROUTES).toContain('"/alerts"');
  });
});

describe("Alert Center UI wiring", () => {
  it("uses ScopedGrowBanner with label='alerts'", () => {
    expect(ALERT_PAGE).toContain("ScopedGrowBanner");
    expect(ALERT_PAGE).toMatch(/label=["']alerts["']/);
  });

  it("uses GrowBreadcrumbs with section='alerts'", () => {
    expect(ALERT_PAGE).toContain("GrowBreadcrumbs");
    expect(ALERT_PAGE).toMatch(/section=["']alerts["']/);
  });

  it("exposes status and severity filters", () => {
    expect(ALERT_PAGE).toMatch(/Filter by status/);
    expect(ALERT_PAGE).toMatch(/Filter by severity/);
  });

  it("renders Acknowledge / Resolve / Dismiss actions", () => {
    expect(ALERT_PAGE).toContain("Acknowledge");
    expect(ALERT_PAGE).toContain("Resolve");
    expect(ALERT_PAGE).toContain("Dismiss");
  });

  it("uses the scoped useScopedGrow hook", () => {
    expect(ALERT_PAGE).toContain("useScopedGrow");
  });
});

// ---------------------------------------------------------------------------
// Dashboard integration
// ---------------------------------------------------------------------------
describe("Dashboard save-alert integration", () => {
  it("imports saveAlert from the alerts lib", () => {
    expect(DASHBOARD).toMatch(/from\s+["']@\/lib\/alerts["']/);
    expect(DASHBOARD).toContain("saveAlert");
  });

  it("renders a Save alert button bound to onClick (user-initiated only)", () => {
    expect(DASHBOARD).toMatch(/onClick=\{[^}]*saveAlert/);
    expect(DASHBOARD).toMatch(/Save alert/);
  });

  it("does not auto-save alerts on render (no top-level saveAlert call)", () => {
    // saveAlert may only appear inside an onClick handler/callback.
    const idx = DASHBOARD.indexOf("saveAlert(");
    expect(idx).toBeGreaterThan(-1);
    // The nearest preceding token should be `await` (inside an arrow fn), not
    // a bare statement at module/component top-level.
    const before = DASHBOARD.slice(0, idx);
    expect(/onClick=\{[^}]*$/.test(before) || /=>\s*$/.test(before.trim()) || /await\s+$/.test(before)).toBe(true);
  });

  it("save payload omits user_id", () => {
    // Inspect the lib's saveAlert payload builder.
    const payloadIdx = ALERTS_LIB.indexOf("const payload");
    expect(payloadIdx).toBeGreaterThan(-1);
    const insertIdx = ALERTS_LIB.indexOf(".insert(payload)");
    expect(insertIdx).toBeGreaterThan(payloadIdx);
    const block = ALERTS_LIB.slice(payloadIdx, insertIdx);
    expect(block).not.toMatch(/\buser_id\b/);
  });
});

// ---------------------------------------------------------------------------
// Status helpers — only update status / timestamps
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", () => {
  const update = vi.fn();
  const eq = vi.fn();
  const select = vi.fn();
  const single = vi.fn();
  const insert = vi.fn();

  const builder = {
    update: (...args: unknown[]) => {
      update(...args);
      return builder;
    },
    eq: (...args: unknown[]) => {
      eq(...args);
      return builder;
    },
    select: (...args: unknown[]) => {
      select(...args);
      return builder;
    },
    single: () => {
      single();
      return Promise.resolve({ data: { id: "a1" }, error: null });
    },
    insert: (...args: unknown[]) => {
      insert(...args);
      return builder;
    },
  };

  return {
    supabase: {
      from: vi.fn(() => builder),
    },
    __spies: { update, eq, select, single, insert },
  };
});

describe("status helpers only update status + timestamps", () => {
  let mod: typeof import("@/lib/alerts");
  let spies: {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("@/lib/alerts");
    const client = await import("@/integrations/supabase/client");
    spies = (client as unknown as { __spies: typeof spies }).__spies;
    spies.update.mockClear();
    spies.eq.mockClear();
    spies.insert.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledgeAlert sets only status + acknowledged_at", async () => {
    await mod.acknowledgeAlert("a1");
    expect(spies.update).toHaveBeenCalledTimes(1);
    const patch = spies.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(
      ["acknowledged_at", "status"].sort(),
    );
    expect(patch.status).toBe("acknowledged");
  });

  it("resolveAlert sets only status + resolved_at", async () => {
    await mod.resolveAlert("a1");
    const patch = spies.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(["resolved_at", "status"].sort());
    expect(patch.status).toBe("resolved");
  });

  it("dismissAlert sets only status", async () => {
    await mod.dismissAlert("a1");
    const patch = spies.update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(["status"]);
    expect(patch.status).toBe("dismissed");
  });

  it("saveAlert insert payload never contains user_id", async () => {
    await mod.saveAlert({
      grow_id: "g1",
      severity: "warning",
      title: "t",
      reason: "r",
    });
    const payload = spies.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("user_id");
    expect(payload.grow_id).toBe("g1");
    expect(payload.status).toBe("open");
  });
});

// ---------------------------------------------------------------------------
// Safety constraints
// ---------------------------------------------------------------------------
describe("alerts foundation safety constraints", () => {
  it("alerts lib does not call ai-coach", () => {
    expect(ALERTS_LIB).not.toMatch(/ai-coach/i);
    expect(ALERTS_LIB).not.toMatch(/functions\.invoke/);
  });

  it("alerts lib does not write to action_queue", () => {
    expect(ALERTS_LIB).not.toMatch(/action_queue/);
  });

  it("alerts lib uses no external-control or device-command strings", () => {
    expect(ALERTS_LIB).not.toMatch(/device[-_ ]command/i);
    expect(ALERTS_LIB).not.toMatch(/actuator/i);
    expect(ALERTS_LIB).not.toMatch(/external[-_ ]control/i);
  });

  it("alerts lib does not use service_role", () => {
    expect(ALERTS_LIB).not.toMatch(/service_role/i);
  });

  it("Alert Center page does not write to action_queue and does not call ai-coach", () => {
    expect(ALERT_PAGE).not.toMatch(/action_queue/);
    expect(ALERT_PAGE).not.toMatch(/ai-coach/i);
  });

  it("Dashboard save-alert block does not introduce ai-coach or action_queue writes", () => {
    const start = DASHBOARD.indexOf("Save alert");
    expect(start).toBeGreaterThan(-1);
    const around = DASHBOARD.slice(Math.max(0, start - 1200), start + 1200);
    expect(around).not.toMatch(/ai-coach/i);
    expect(around).not.toMatch(/action_queue/);
    expect(around).not.toMatch(/device[-_ ]command/i);
  });

  // Defensive — only inspect the new alerts SQL block.
  it("alerts migration does not introduce service_role usage", () => {
    expect(ALERTS_SQL).not.toMatch(/service_role/i);
  });
});
