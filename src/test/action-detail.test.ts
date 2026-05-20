import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");
const DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");

describe("Action Queue detail view", () => {
  it("registers the /actions/:actionId route in App.tsx", () => {
    expect(APP).toMatch(/path="\/actions\/:actionId"\s+element=\{<ActionDetail\s*\/>\}/);
    expect(APP).toMatch(/import ActionDetail from "\.\/pages\/ActionDetail"/);
  });

  it("uses the useParams actionId from the URL", () => {
    expect(DETAIL).toMatch(/useParams<\{\s*actionId:\s*string\s*\}>/);
  });

  it("queries action_queue by id with maybeSingle (safe not-found)", () => {
    expect(DETAIL).toMatch(
      /\.from\(\s*["']action_queue["']\s*\)[\s\S]{0,600}\.eq\(\s*["']id["']\s*,\s*actionId\s*\)[\s\S]{0,80}\.maybeSingle\(\)/,
    );
  });

  it("queries action_queue_events by action_queue_id ordered newest-first", () => {
    expect(DETAIL).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,400}\.eq\(\s*["']action_queue_id["']\s*,\s*actionId\s*\)[\s\S]{0,200}\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    );
  });

  it("renders an audit-history section and shows previous → new status", () => {
    expect(DETAIL).toMatch(/aria-label="Audit history"/);
    expect(DETAIL).toMatch(/previous_status \?\? "—"\}\s*→\s*\{e\.new_status \?\? "—"/);
  });

  it("renders a not-found / RLS-blocked safe state", () => {
    expect(DETAIL).toMatch(/Action not found/);
    expect(DETAIL).toMatch(/do not have access/);
  });

  it("has a Back to Action Queue link to /actions via actionsPath()", () => {
    expect(DETAIL).toMatch(/to=\{actionsPath\(\)\}/);
    expect(DETAIL).toMatch(/Back to Action Queue/);
  });

  it("guards transitions on terminal statuses via shared helper", () => {
    expect(DETAIL).toMatch(/from "@\/lib\/actionQueueTransitions"/);
    expect(DETAIL).toMatch(/isTerminalStatus/);
    expect(DETAIL).toMatch(/!isTerminal\(row\.status\) && \(/);
    expect(DETAIL).toMatch(/if \(!row \|\| isTerminal\(row\.status\)\) return;/);
  });

  it("imports the shared transition guards (canApprove/canSimulate/canReject/canComplete/canCancel)", () => {
    expect(DETAIL).toMatch(/import \{[\s\S]*?canApprove[\s\S]*?canSimulate[\s\S]*?canReject[\s\S]*?canComplete[\s\S]*?canCancel[\s\S]*?\} from "@\/lib\/actionQueueTransitions"/);
  });

  it("does not allow editing audit events (no update on action_queue_events)", () => {
    expect(DETAIL).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.update\(/);
    expect(DETAIL).not.toMatch(/\.from\(\s*["']action_queue_events["']\s*\)[\s\S]{0,200}\.delete\(/);
  });

  it("audit insert omits user_id (DB default auth.uid() wins)", () => {
    const m = DETAIL.match(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\{([\s\S]*?)\}\)/,
    );
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(/user_id/);
  });

  it("introduces no device-control surface or service_role", () => {
    expect(DETAIL).not.toMatch(/mqtt|home.?assistant|pi_bridge|webhook|relay|actuator/i);
    expect(DETAIL).not.toMatch(/service_role/i);
  });
});
