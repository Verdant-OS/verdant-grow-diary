import fs from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

// Owner decision on #1852 (2026-10-01): one scheduled daily run, nothing more.
export const QUICKLOG_SMOKE_DAILY_CRON = "17 9 * * *";

type Job = { if?: string };
export type QuickLogSmokeWorkflow = {
  on: Record<string, unknown> & { schedule?: Array<{ cron: string }> };
  jobs: Record<string, Job>;
};

/** Resolved quicklog-smoke.yml, so trigger contracts assert on values, not source text. */
export function loadQuickLogSmokeWorkflow(root: string): QuickLogSmokeWorkflow {
  const text = fs.readFileSync(path.join(root, ".github/workflows/quicklog-smoke.yml"), "utf8");
  return load(text) as QuickLogSmokeWorkflow;
}
