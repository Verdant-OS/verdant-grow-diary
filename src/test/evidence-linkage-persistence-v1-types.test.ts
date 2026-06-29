/**
 * Evidence Linkage Persistence v1 — types + persistence audit.
 *
 * Confirms that the BLOCKED slice-C audit is intentionally lifted: both
 * `alerts` and `action_queue` now expose a typed
 * `originating_timeline_events` column, both detail pages adapt that column
 * instead of mounting empty events, and both write-paths persist refs (or an
 * explicit empty array — never inferred).
 *
 * Read-only static scan. No React. No Supabase. No fetch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
  ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
} from "@/lib/originatingTimelineEventRules";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sliceBlock(src: string, anchor: string, size = 4000): string {
  const start = src.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, start + size);
}

describe("Evidence Linkage Persistence v1 — schema + wiring", () => {
  it("alerts row type exposes originating_timeline_events", () => {
    const types = read("src/integrations/supabase/types.ts");
    const block = sliceBlock(types, "alerts: {");
    expect(block).toContain("originating_timeline_events: Json");
    expect(block).toContain("originating_timeline_events?: Json");
  });

  it("action_queue row type exposes originating_timeline_events", () => {
    const types = read("src/integrations/supabase/types.ts");
    const block = sliceBlock(types, "action_queue: {");
    expect(block).toContain("originating_timeline_events: Json");
    expect(block).toContain("originating_timeline_events?: Json");
  });

  it("alerts/action_queue row blocks do not introduce raw-payload or secret columns", () => {
    // Bound the inspected slice to just the table's own Row/Insert/Update
    // section by trimming at the next ` <name>: {` table sentinel.
    function sliceTable(src: string, anchor: string): string {
      const start = src.indexOf(anchor);
      expect(start).toBeGreaterThan(-1);
      const rest = src.slice(start + anchor.length);
      const nextTable = rest.search(/\n {6}[a-z_]+: \{\n/);
      const end = nextTable >= 0 ? start + anchor.length + nextTable : src.length;
      return src.slice(start, end);
    }
    const types = read("src/integrations/supabase/types.ts");
    for (const anchor of ["alerts: {", "action_queue: {"]) {
      const block = sliceTable(types, anchor);
      for (const banned of [
        "raw_payload",
        "service_role",
        "bridge_token",
        "api_token",
        "prompt",
        "completion",
      ]) {
        expect(block.includes(banned), `${anchor} contains ${banned}`).toBe(
          false,
        );
      }
    }
  });

  it("AlertRow in src/lib/alerts.ts exposes the persisted refs field", () => {
    const src = read("src/lib/alerts.ts");
    expect(src).toContain("originating_timeline_events");
  });

  it("AlertDetail no longer mounts EvidenceLinkageBadges with events={[]}", () => {
    const src = read("src/pages/AlertDetail.tsx");
    expect(src).toContain("adaptOriginatingTimelineEventsFromRow");
    expect(src).toContain("ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY");
    expect(src.includes("events={[]}")).toBe(false);
  });

  it("ActionDetail mounts EvidenceLinkageBadges with adapted refs (no empties)", () => {
    const src = read("src/pages/ActionDetail.tsx");
    expect(src).toContain("adaptOriginatingTimelineEventsFromRow");
    expect(src).toContain("ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY");
    expect(src).toContain(
      "ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY",
    );
    expect(src.includes("events={[]}")).toBe(false);
    expect(src).toContain("originating_timeline_events");
  });

  it("alert→action insert path persists an explicit refs array (never inferred)", () => {
    const src = read("src/pages/AlertDetail.tsx");
    // v1 contract: refs are forwarded from the alert via the shared
    // forwarding adapter — never inferred from prose, timestamps, plant/tent,
    // alert id, or metric name. The adapter itself returns an explicit array
    // (possibly empty) so the persisted column is always a sanitized array.
    expect(src).toContain(
      'from "@/lib/originatingTimelineEventForwardRules"',
    );
    expect(src).toContain("forwardAlertRefsToActionQueue");
    expect(src).toMatch(
      /originating_timeline_events:\s*[\s\S]{0,80}forwardAlertRefsToActionQueue\(\s*alert\s*\)/,
    );
    // Guard against accidental reintroduction of inference: no nearest-reading
    // / timestamp / metric-name heuristics in the insert payload region.
    const insertRegion =
      src.slice(src.indexOf("originating_timeline_events:"), src.indexOf("originating_timeline_events:") + 400);
    expect(insertRegion).not.toMatch(/nearest|inferFrom|guessFrom|approximate/i);
  });

  it("AI Doctor→action insert path persists an explicit refs array", () => {
    const src = read(
      "src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts",
    );
    expect(src).toMatch(/originating_timeline_events:\s*\[\]/);
  });

  it("saveAlert accepts and persists optional refs (defaulting to [])", () => {
    const src = read("src/lib/alerts.ts");
    expect(src).toContain("originating_timeline_events");
    expect(src).toContain("normalizeOriginatingTimelineEvents");
  });

  it("fallback copy constants remain calm and free of certainty/automation tokens", () => {
    const banned = [
      "auto",
      "automated",
      "device",
      "command",
      "execute",
      "guaranteed",
      "certain",
    ];
    for (const copy of [
      ALERT_REVIEW_EVIDENCE_NOT_LINKED_COPY,
      ACTION_QUEUE_ALERT_DERIVED_EVIDENCE_NOT_LINKED_COPY,
      ACTION_QUEUE_AI_DOCTOR_DERIVED_EVIDENCE_NOT_LINKED_COPY,
    ]) {
      const lower = copy.toLowerCase();
      for (const tok of banned) {
        expect(lower.includes(tok)).toBe(false);
      }
    }
  });
});
