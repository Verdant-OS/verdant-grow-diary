/**
 * Quick-context links on Action Detail.
 *
 * Asserts:
 *  - Tent and Plant IDs render as <Link> to their detail routes when present.
 *  - Grow renders as read-only text (no /grows/:id detail route exists yet).
 *  - Conditional rendering still gated on tent_id / plant_id presence.
 *  - Back to Action Queue link preserved.
 *  - Audit history remains read-only and no device-control surface introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("ActionDetail — quick context links", () => {
  it("links Tent ID to /tents/:id when tent_id exists", () => {
    expect(DETAIL).toMatch(/row\.tent_id\s*&&\s*<IdField[^>]*to=\{`\/tents\/\$\{row\.tent_id\}`\}/);
  });

  it("links Plant ID to /plants/:id when plant_id exists", () => {
    expect(DETAIL).toMatch(/row\.plant_id\s*&&\s*<IdField[^>]*to=\{`\/plants\/\$\{row\.plant_id\}`\}/);
  });

  it("links Grow ID to /grows/:growId now that the route exists", () => {
    expect(DETAIL).toMatch(/<IdField\s+label="Grow"\s+id=\{row\.grow_id\}\s+to=\{growDetailPath\(row\.grow_id\)\}/);
    expect(APP).toMatch(/path="\/grows\/:growId"/);
  });


  it("IdField renders a Link only when 'to' is provided, plain span otherwise", () => {
    expect(DETAIL).toMatch(/function IdField[\s\S]*?to \? \(\s*<Link[\s\S]*?\) : \(\s*<span>/);
  });

  it("Back to Action Queue link is preserved via actionsPath()", () => {
    expect(DETAIL).toMatch(/to=\{actionsPath\(\)\}/);
    expect(DETAIL).toMatch(/Back to Action Queue/);
  });

  it("audit events remain read-only (no update/delete)", () => {
    expect(DETAIL).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.update\(/);
    expect(DETAIL).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.delete\(/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(DETAIL).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(DETAIL).not.toMatch(/service_role/i);
  });
});
