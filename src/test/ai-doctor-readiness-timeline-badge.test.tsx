/**
 * AI Doctor readiness timeline badge — display-only.
 *
 * Verifies:
 *  - predicate + view model key off details.kind === AI_DOCTOR_READINESS_CHECK_KIND
 *  - the badge derives freshness/age from the STORED details (historical
 *    truth at check time), never from the current clock
 *  - fresh / stale / missing variants + labels; malformed details never crash
 *  - contract fidelity: a draft produced by buildAiDoctorReadinessDiaryEntry
 *    renders through the badge without translation
 *  - Timeline.tsx mounts the badge and suppresses the raw machine-field chips
 *  - static guard: presenter & helper import no Supabase/RPC/fetch/
 *    Action-Queue/alert/model client code
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AiDoctorReadinessTimelineBadge from "@/components/AiDoctorReadinessTimelineBadge";
import {
  buildAiDoctorReadinessTimelineBadge,
  isAiDoctorReadinessCheckEvent,
} from "@/lib/aiDoctorReadinessTimelineBadge";
import {
  AI_DOCTOR_READINESS_CHECK_KIND,
  buildAiDoctorReadinessDiaryEntry,
} from "@/lib/aiDoctorReadinessDiaryEntryRules";
import { AI_DOCTOR_SNAPSHOT_FRESH_MS } from "@/lib/aiDoctorContextRules";

const ROOT = process.cwd();
const HELPER_SRC = readFileSync(
  resolve(ROOT, "src/lib/aiDoctorReadinessTimelineBadge.ts"),
  "utf8",
);
const BADGE_SRC = readFileSync(
  resolve(ROOT, "src/components/AiDoctorReadinessTimelineBadge.tsx"),
  "utf8",
);
const TIMELINE_SRC = readFileSync(resolve(ROOT, "src/pages/Timeline.tsx"), "utf8");

const NOW = Date.parse("2026-06-01T12:00:00.000Z");

function readinessEvent(details: Record<string, unknown>) {
  return { details: { kind: AI_DOCTOR_READINESS_CHECK_KIND, ...details } };
}

describe("isAiDoctorReadinessCheckEvent", () => {
  it("returns true only for details.kind === ai_doctor_readiness_check", () => {
    expect(isAiDoctorReadinessCheckEvent(readinessEvent({}))).toBe(true);
    expect(isAiDoctorReadinessCheckEvent({ details: { kind: "ai_doctor_check_in" } })).toBe(false);
    expect(isAiDoctorReadinessCheckEvent({ details: { event_type: "watering" } })).toBe(false);
  });

  it("safely returns false for malformed / missing details", () => {
    expect(isAiDoctorReadinessCheckEvent(null)).toBe(false);
    expect(isAiDoctorReadinessCheckEvent(undefined)).toBe(false);
    expect(isAiDoctorReadinessCheckEvent({})).toBe(false);
    expect(isAiDoctorReadinessCheckEvent({ details: null })).toBe(false);
    expect(isAiDoctorReadinessCheckEvent({ details: "x" as unknown })).toBe(false);
    expect(isAiDoctorReadinessCheckEvent({ details: [1, 2] as unknown })).toBe(false);
    expect(isAiDoctorReadinessCheckEvent({ details: { kind: 42 as unknown } })).toBe(false);
  });
});

describe("buildAiDoctorReadinessTimelineBadge — stored truth only", () => {
  it("fresh check: positive variant with the age AT CHECK, from stored fields", () => {
    const vm = buildAiDoctorReadinessTimelineBadge(
      readinessEvent({
        snapshot_freshness: "fresh",
        snapshot_at: "2026-06-01T09:00:00.000Z",
        snapshot_age_minutes: 180,
      }),
    );
    expect(vm).not.toBeNull();
    expect(vm!.freshness).toBe("fresh");
    expect(vm!.variant).toBe("positive");
    expect(vm!.label).toBe("Snapshot fresh · 3h old at check");
    expect(vm!.snapshotAtIso).toBe("2026-06-01T09:00:00.000Z");
  });

  it("stale check: warning variant, day-bucketed age label", () => {
    const vm = buildAiDoctorReadinessTimelineBadge(
      readinessEvent({
        snapshot_freshness: "stale",
        snapshot_at: "2026-05-29T12:00:00.000Z",
        snapshot_age_minutes: 3 * 24 * 60,
      }),
    );
    expect(vm!.freshness).toBe("stale");
    expect(vm!.variant).toBe("warning");
    expect(vm!.label).toBe("Snapshot stale · 3d old at check");
  });

  it("missing snapshot: neutral variant, honest no-snapshot copy", () => {
    const vm = buildAiDoctorReadinessTimelineBadge(
      readinessEvent({
        snapshot_freshness: "missing",
        snapshot_at: null,
        snapshot_age_minutes: null,
      }),
    );
    expect(vm!.freshness).toBe("missing");
    expect(vm!.variant).toBe("neutral");
    expect(vm!.label).toBe("No snapshot at check");
    expect(vm!.snapshotAtIso).toBeNull();
  });

  it("never re-grades against the current clock: an old fresh-at-check entry stays fresh", () => {
    // Snapshot + check happened long before "today"; stored freshness wins.
    const vm = buildAiDoctorReadinessTimelineBadge(
      readinessEvent({
        snapshot_freshness: "fresh",
        snapshot_at: "2020-01-01T00:00:00.000Z",
        snapshot_age_minutes: 5,
      }),
    );
    expect(vm!.freshness).toBe("fresh");
    expect(vm!.label).toBe("Snapshot fresh · 5m old at check");
  });

  it("malformed freshness / age values collapse to the honest neutral state", () => {
    const unknownFreshness = buildAiDoctorReadinessTimelineBadge(
      readinessEvent({ snapshot_freshness: "shiny", snapshot_age_minutes: 10 }),
    );
    expect(unknownFreshness!.freshness).toBe("missing");
    expect(unknownFreshness!.label).toBe("No snapshot at check");

    const badEvidence = buildAiDoctorReadinessTimelineBadge(
      readinessEvent({
        snapshot_freshness: "stale",
        snapshot_age_minutes: Number.NaN,
        snapshot_at: "not-a-date",
      }),
    );
    expect(badEvidence!.freshness).toBe("missing");
    expect(badEvidence!.label).toBe("No snapshot at check");
    expect(badEvidence!.snapshotAtIso).toBeNull();
  });

  it("never renders a positive badge from a fresh claim with incomplete evidence", () => {
    // details is untrusted JSON: `snapshot_freshness: "fresh"` alone must
    // not present unknown telemetry as healthy. The builder always writes
    // BOTH snapshot_at and snapshot_age_minutes for fresh/stale states.
    const incompleteCases: Array<Record<string, unknown>> = [
      { snapshot_freshness: "fresh" },
      { snapshot_freshness: "fresh", snapshot_at: null, snapshot_age_minutes: null },
      { snapshot_freshness: "fresh", snapshot_at: "2026-06-01T09:00:00.000Z" },
      { snapshot_freshness: "fresh", snapshot_age_minutes: 180 },
      { snapshot_freshness: "fresh", snapshot_at: "garbage", snapshot_age_minutes: 180 },
      {
        snapshot_freshness: "fresh",
        snapshot_at: "2026-06-01T09:00:00.000Z",
        snapshot_age_minutes: -5,
      },
    ];
    for (const details of incompleteCases) {
      const vm = buildAiDoctorReadinessTimelineBadge(readinessEvent(details));
      expect(vm, JSON.stringify(details)).not.toBeNull();
      expect(vm!.freshness, JSON.stringify(details)).toBe("missing");
      expect(vm!.variant, JSON.stringify(details)).toBe("neutral");
      expect(vm!.label, JSON.stringify(details)).toBe("No snapshot at check");
      expect(vm!.snapshotAtIso, JSON.stringify(details)).toBeNull();
    }
  });

  it("returns null for non-readiness events", () => {
    expect(buildAiDoctorReadinessTimelineBadge({ details: { kind: "watering" } })).toBeNull();
    expect(buildAiDoctorReadinessTimelineBadge(null)).toBeNull();
  });
});

describe("write-path contract: builder draft renders through the badge", () => {
  it("a stale-at-check draft from buildAiDoctorReadinessDiaryEntry yields the warning badge", () => {
    const snapshotAt = new Date(NOW - AI_DOCTOR_SNAPSHOT_FRESH_MS - 60_000).toISOString();
    const built = buildAiDoctorReadinessDiaryEntry({
      readiness: "partial",
      latestSnapshotAtIso: snapshotAt,
      growId: "g1",
      plantId: "p1",
      now: NOW,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const vm = buildAiDoctorReadinessTimelineBadge({ details: built.draft.details });
    expect(vm).not.toBeNull();
    expect(vm!.freshness).toBe("stale");
    expect(vm!.snapshotAtIso).toBe(snapshotAt);
  });

  it("a fresh-at-check draft yields the positive badge", () => {
    const built = buildAiDoctorReadinessDiaryEntry({
      readiness: "strong",
      latestSnapshotAtIso: new Date(NOW - 3 * 3_600_000).toISOString(),
      growId: "g1",
      now: NOW,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const vm = buildAiDoctorReadinessTimelineBadge({ details: built.draft.details });
    expect(vm!.freshness).toBe("fresh");
    expect(vm!.label).toBe("Snapshot fresh · 3h old at check");
  });
});

describe("<AiDoctorReadinessTimelineBadge />", () => {
  it("renders the badge with data attributes + accessible name for readiness entries", () => {
    render(
      <AiDoctorReadinessTimelineBadge
        event={readinessEvent({
          snapshot_freshness: "stale",
          snapshot_at: "2026-05-29T12:00:00.000Z",
          snapshot_age_minutes: 4320,
        })}
      />,
    );
    const badge = screen.getByTestId("ai-doctor-readiness-timeline-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("Snapshot stale · 3d old at check");
    expect(badge).toHaveAccessibleName(/manual sensor snapshot was stale/i);
    expect(badge.getAttribute("data-snapshot-freshness")).toBe("stale");
    expect(badge.getAttribute("data-snapshot-at")).toBe("2026-05-29T12:00:00.000Z");
  });

  it("does not render for ordinary events", () => {
    const { container } = render(
      <AiDoctorReadinessTimelineBadge event={{ details: { event_type: "watering" } }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not render or crash for malformed / missing details", () => {
    const cases: Array<unknown> = [
      null,
      undefined,
      {},
      { details: null },
      { details: "ai_doctor_readiness_check" },
      { details: { kind: 42 } },
      { details: [] },
    ];
    for (const c of cases) {
      const { container, unmount } = render(
        <AiDoctorReadinessTimelineBadge event={c as never} />,
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });
});

describe("Timeline integration (source pin)", () => {
  it("mounts the readiness badge next to the check-in badge", () => {
    expect(TIMELINE_SRC).toContain("<AiDoctorReadinessTimelineBadge event={e} />");
  });

  it("suppresses raw machine-field chips for readiness-check rows", () => {
    expect(TIMELINE_SRC).toContain(
      "const isReadinessCheckEvent = isAiDoctorReadinessCheckEvent(e);",
    );
    // Mirrors the learning-loop pin in timeline-learning-loop-entries.test.ts,
    // which requires the literal `isLearningLoopEvent ? []` to survive.
    expect(TIMELINE_SRC).toMatch(/isReadinessCheckEvent\s*\?\s*\[\]/);
  });
});

describe("static safety guard — no save/RPC/model imports", () => {
  const FORBIDDEN = [
    /from\s+["']@\/integrations\/supabase/i,
    /from\s+["']@supabase\//i,
    /\bfetch\s*\(/,
    /\.rpc\s*\(/,
    /functions\.invoke/i,
    /useQuickLogV2Save/,
    /action[_-]?queue/i,
    /alertHelpers|usePersistEnvironmentAlerts|alertsList/i,
    /openai|anthropic|aiClient|modelClient|ai-gateway/i,
  ];
  it("helper and presenter contain no forbidden imports", () => {
    for (const src of [HELPER_SRC, BADGE_SRC]) {
      for (const pat of FORBIDDEN) {
        expect(pat.test(src)).toBe(false);
      }
    }
  });
});
