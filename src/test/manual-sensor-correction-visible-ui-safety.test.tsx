/**
 * Manual sensor correction — visible-UI guard.
 *
 * The correction handoff carries per-metric UUIDs in the URL hash. Those
 * IDs are for wiring only — they must never appear in visible UI copy
 * (banner text, affordance labels, aria-labels). This test renders the
 * three surfaces that touch correction context and asserts no UUID leaks
 * into user-visible text.
 *
 * Also guards that:
 *  - a malformed correction hash does NOT put the card into correction
 *    mode (banner absent, standard header shown).
 *  - missing original reading IDs hide the "Correct manual reading"
 *    affordance on the Quick Log strip.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useInsertSensorReading", () => ({
  useInsertSensorReading: () => ({ mutateAsync: vi.fn(), isPending: false }),
  validateSensorReadingPayload: () => {},
}));
vi.mock("@/hooks/useInsertManualSnapshotEdit", () => ({
  insertManualSnapshotEdit: vi.fn(),
  useInsertManualSnapshotEdit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/insertManualSensorReadingReturningId", () => ({
  insertManualSensorReadingReturningId: vi.fn(),
}));
// The strip fetches its own state; return a manual, fresh snapshot so
// the "Correct manual reading" affordance is eligible to render.
vi.mock("@/lib/sensor", () => ({
  useLatestTentSensorSnapshot: () => ({
    status: "ready" as const,
    snapshot: {
      source: "manual",
      captured_at: "2026-07-01T12:00:00.000Z",
      temperature_c: 24,
      humidity_pct: 58,
    },
  }),
}));

import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  decodeManualCorrectionHash,
  type ManualCorrectionContext,
} from "@/lib/manualSensorCorrectionContext";

const TENT = "11111111-1111-4111-8111-111111111111";
const R_TEMP = "22222222-2222-4222-8222-222222222222";
const R_RH = "33333333-3333-4333-8333-333333333333";

const CTX: ManualCorrectionContext = {
  tentId: TENT,
  originalCapturedAt: "2026-07-01T12:00:00.000Z",
  originalReadingIds: { temperature_c: R_TEMP, humidity_pct: R_RH },
  originalValues: { temperature_c: 24, humidity_pct: 58 },
};

function containsAnyUuid(text: string): boolean {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text);
}

describe("manual sensor correction — hash + visible UI safety", () => {
  it("malformed correction hash does NOT open correction mode", () => {
    // Missing r_* IDs, wrong prefix, non-UUID tent — all reject to null.
    expect(decodeManualCorrectionHash("#manual-reading?correct=1")).toBeNull();
    expect(
      decodeManualCorrectionHash(
        `#not-manual-reading?correct=1&tent_id=${TENT}&captured_at=2026-07-01T12:00:00.000Z&r_temperature_c=${R_TEMP}`,
      ),
    ).toBeNull();
    expect(
      decodeManualCorrectionHash(
        `#manual-reading?correct=1&tent_id=nope&captured_at=2026-07-01T12:00:00.000Z&r_temperature_c=${R_TEMP}`,
      ),
    ).toBeNull();
    expect(
      decodeManualCorrectionHash(
        `#manual-reading?correct=1&tent_id=${TENT}&captured_at=not-a-date&r_temperature_c=${R_TEMP}`,
      ),
    ).toBeNull();
  });

  it("ManualSensorReadingCard in correction mode does not render any UUID in visible text", () => {
    const { container, getByTestId } = render(
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: TENT, name: "Tent A" }]}
          correction={CTX}
        />
      </MemoryRouter>,
    );
    const banner = getByTestId("manual-reading-correction-banner");
    expect(banner.textContent ?? "").not.toMatch(/[0-9a-f-]{36}/i);
    // The whole card's visible text must not include any UUID.
    expect(containsAnyUuid(container.textContent ?? "")).toBe(false);
  });

  it("ManualSensorReadingCard without correction shows standard header (no banner)", () => {
    const { queryByTestId } = render(
      <MemoryRouter>
        <ManualSensorReadingCard
          tents={[{ id: TENT, name: "Tent A" }]}
          correction={null}
        />
      </MemoryRouter>,
    );
    expect(queryByTestId("manual-reading-correction-banner")).toBeNull();
  });

  it("QuickLog strip hides Correct action when original IDs are missing", () => {
    const { queryByTestId } = render(
      <MemoryRouter>
        <QuickLogSensorSnapshotStrip
          tentId={TENT}
          manualCapturedAt={CTX.originalCapturedAt}
          // No manualReadingIds — affordance must be hidden.
        />
      </MemoryRouter>,
    );
    expect(queryByTestId("quicklog-sensor-snapshot-correct-action")).toBeNull();
  });

  it("QuickLog strip shows Correct action with UUIDs only in href, never in visible text", () => {
    const view = {
      status: "ok" as const,
      title: "Sensor snapshot",
      providerLabel: "Manual",
      lines: [],
    };
    const { getByTestId } = render(
      <MemoryRouter>
        <QuickLogSensorSnapshotStrip
          view={view as never}
          tentId={TENT}
          manualCapturedAt={CTX.originalCapturedAt}
          manualReadingIds={CTX.originalReadingIds}
          manualValues={CTX.originalValues}
        />
      </MemoryRouter>,
    );
    const link = getByTestId("quicklog-sensor-snapshot-correct-action") as HTMLAnchorElement;
    // Visible label + aria-label must not contain any UUID.
    expect(containsAnyUuid(link.textContent ?? "")).toBe(false);
    expect(containsAnyUuid(link.getAttribute("aria-label") ?? "")).toBe(false);
    // Href carries the encoded IDs — that is the wiring channel.
    expect(link.getAttribute("href") ?? "").toContain("#manual-reading?");
  });
});
