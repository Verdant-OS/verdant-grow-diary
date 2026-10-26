/**
 * Contract: timeline surfaces that must not import alertReasonDisplayRules by
 * path name use localDateTimeDisplayRules — a re-export, not a fork.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSnapshotCapturedAt as fromAlertRules } from "@/lib/alertReasonDisplayRules";
import { formatSnapshotCapturedAt as fromLocalRules } from "@/lib/localDateTimeDisplayRules";

describe("localDateTimeDisplayRules", () => {
  it("re-exports the same formatSnapshotCapturedAt as alertReasonDisplayRules", () => {
    expect(fromLocalRules).toBe(fromAlertRules);
    const iso = "2026-10-15T15:54:26.221Z";
    expect(fromLocalRules(iso)).toBe(fromAlertRules(iso));
  });

  it("TimelineEvidenceDetailDrawer imports local time via localDateTimeDisplayRules only", () => {
    const body = readFileSync(
      join(process.cwd(), "src/components/TimelineEvidenceDetailDrawer.tsx"),
      "utf8",
    );
    expect(body).toMatch(/from\s+["']@\/lib\/localDateTimeDisplayRules["']/);
    expect(body).not.toMatch(/alertReasonDisplayRules/);
  });
});
