import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const ACTION_QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const TIMELINE = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");
const DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");

describe("Action Queue → Detail navigation", () => {
  it("ActionQueue imports Link from react-router-dom", () => {
    expect(ACTION_QUEUE).toMatch(/import \{[^}]*\bLink\b[^}]*\} from "react-router-dom"/);
  });

  it("ActionQueue cards link to /actions/${row.id}", () => {
    const matches = ACTION_QUEUE.match(/to=\{`\/actions\/\$\{row\.id\}`\}/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(ACTION_QUEUE).toMatch(/View Details/);
  });

  it("ActionQueue still wires Approve/Reject/Simulate/Complete/Cancel onClick handlers", () => {
    expect(ACTION_QUEUE).toMatch(/onClick=\{\(\) => approve\(row\)\}/);
    expect(ACTION_QUEUE).toMatch(/onClick=\{\(\) => reject\(row\)\}/);
    expect(ACTION_QUEUE).toMatch(/onClick=\{\(\) => simulate\(row\)\}/);
    expect(ACTION_QUEUE).toMatch(/onClick=\{\(\) => complete\(row\)\}/);
    expect(ACTION_QUEUE).toMatch(/onClick=\{\(\) => cancelAction\(row\)\}/);
  });

  it("Timeline action events link to /actions/${e.action_queue_id} when present", () => {
    expect(TIMELINE).toMatch(/e\.action_queue_id && \(/);
    expect(TIMELINE).toMatch(/to=\{`\/actions\/\$\{e\.action_queue_id\}`\}/);
    expect(TIMELINE).toMatch(/View Details/);
  });

  it("Detail Back link still returns to /actions", () => {
    expect(DETAIL).toMatch(/to="\/actions"/);
    expect(DETAIL).toMatch(/Back to Action Queue/);
  });

  it("introduces no device-control surface", () => {
    expect(ACTION_QUEUE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(TIMELINE).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
  });
});
