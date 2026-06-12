/**
 * AI Doctor Check-In Timeline Badge — display-only.
 *
 * Verifies:
 *  - badge renders for events with details.kind === "ai_doctor_check_in"
 *  - badge does NOT render for ordinary observation/note events
 *  - badge does NOT crash and renders nothing for malformed/missing details
 *  - badge does NOT replace the primary event-type label
 *  - badge is accessible by name/role
 *  - static guard: presenter & helper import no Supabase/RPC/fetch/
 *    Action-Queue/alert/model client code
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AiDoctorCheckInTimelineBadge from "@/components/AiDoctorCheckInTimelineBadge";
import {
  AI_DOCTOR_CHECK_IN_BADGE_LABEL,
  isAiDoctorCheckInEvent,
} from "@/lib/aiDoctorCheckInEventBadge";

const ROOT = process.cwd();
const HELPER_SRC = readFileSync(
  resolve(ROOT, "src/lib/aiDoctorCheckInEventBadge.ts"),
  "utf8",
);
const BADGE_SRC = readFileSync(
  resolve(ROOT, "src/components/AiDoctorCheckInTimelineBadge.tsx"),
  "utf8",
);

describe("isAiDoctorCheckInEvent", () => {
  it("returns true when details.kind matches", () => {
    expect(
      isAiDoctorCheckInEvent({ details: { kind: "ai_doctor_check_in" } }),
    ).toBe(true);
  });

  it("returns false for ordinary observation events", () => {
    expect(isAiDoctorCheckInEvent({ details: { kind: "watering" } })).toBe(false);
    expect(isAiDoctorCheckInEvent({ details: {} })).toBe(false);
  });

  it("safely returns false for malformed / missing details", () => {
    expect(isAiDoctorCheckInEvent(null)).toBe(false);
    expect(isAiDoctorCheckInEvent(undefined)).toBe(false);
    expect(isAiDoctorCheckInEvent({})).toBe(false);
    expect(isAiDoctorCheckInEvent({ details: null })).toBe(false);
    expect(
      isAiDoctorCheckInEvent({ details: "ai_doctor_check_in" as unknown }),
    ).toBe(false);
    expect(isAiDoctorCheckInEvent({ details: { kind: 42 as unknown } })).toBe(
      false,
    );
  });
});

describe("AiDoctorCheckInTimelineBadge", () => {
  it("renders the AI Doctor check-in sub-badge for matching events", () => {
    render(
      <AiDoctorCheckInTimelineBadge
        event={{ details: { kind: "ai_doctor_check_in" } }}
      />,
    );
    const badge = screen.getByTestId("ai-doctor-check-in-timeline-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(AI_DOCTOR_CHECK_IN_BADGE_LABEL);
    expect(badge).toHaveAccessibleName(/AI Doctor check-in/i);
  });

  it("does not render for ordinary observation events", () => {
    const { container } = render(
      <AiDoctorCheckInTimelineBadge
        event={{ details: { kind: "observation", note: "ok" } }}
      />,
    );
    expect(
      screen.queryByTestId("ai-doctor-check-in-timeline-badge"),
    ).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("does not render or crash for malformed / missing details", () => {
    const cases: Array<unknown> = [
      null,
      undefined,
      {},
      { details: null },
      { details: "ai_doctor_check_in" },
      { details: { kind: 42 } },
    ];
    for (const c of cases) {
      const { container, unmount } = render(
        <AiDoctorCheckInTimelineBadge event={c as never} />,
      );
      expect(container.firstChild).toBeNull();
      unmount();
    }
  });

  it("never renders the primary event-type label itself (sub-badge only)", () => {
    render(
      <AiDoctorCheckInTimelineBadge
        event={{ details: { kind: "ai_doctor_check_in" } }}
      />,
    );
    // Sub-badge text only — must not echo "Note", "Observation", or event_type.
    expect(screen.queryByText(/^Note$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Observation$/i)).not.toBeInTheDocument();
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
  for (const src of [HELPER_SRC, BADGE_SRC]) {
    for (const pat of FORBIDDEN) {
      expect(pat.test(src)).toBe(false);
    }
  }
});
