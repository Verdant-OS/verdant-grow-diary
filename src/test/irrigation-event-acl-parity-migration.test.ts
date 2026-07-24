import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260724055000_irrigation_event_acl_parity.sql"),
  "utf8",
);

describe("additive irrigation event ACL parity migration", () => {
  it("restores reader and server grants without reopening client writes", () => {
    expect(sql).toMatch(/GRANT SELECT ON TABLE[\s\S]*TO authenticated/);
    expect(sql).toMatch(/GRANT ALL ON TABLE[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]*TO authenticated/i);
    expect(sql).not.toMatch(/GRANT[\s\S]*TO anon/i);
  });

  it("covers the closed irrigation event-table set", () => {
    for (const table of ["grow_events", "watering_events", "feeding_events"]) {
      expect(sql).toContain(`public.${table}`);
      expect(sql).toContain(`'${table}'`);
    }
  });

  it("preserves legacy server execute while clients remain revoked", () => {
    expect(sql).toContain("'create_watering_event'");
    expect(sql).toContain("'create_feeding_event'");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO service_role/);
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/has_function_privilege\('authenticated'/);
    expect(sql).toMatch(/has_function_privilege\('service_role'/);
  });
});
