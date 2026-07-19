/**
 * AiDoctorSessionIntegrityLedger — component tests.
 *
 * The data hook is mocked directly; its own runtime behavior (select
 * columns, pagination, archived-name exclusion) is covered separately in
 * ai-doctor-session-ledger-hook.test.tsx. This file proves the presenter:
 * loading/empty/error/retry, pager, technical-ID toggle + copy, and honest
 * rendering of archived/unavailable + plantless + legacy-evidence entries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AiDoctorLedgerEntry } from "@/lib/aiDoctorSessionLedgerViewModel";

const useAiDoctorSessionLedgerMock = vi.fn();
vi.mock("@/hooks/useAiDoctorSessionLedger", () => ({
  useAiDoctorSessionLedger: (...args: unknown[]) => useAiDoctorSessionLedgerMock(...args),
}));

const copyShareLinkMock = vi.fn(async (_text: string) => {});
vi.mock("@/lib/aiDoctorSessionsShareLinkRules", () => ({
  copyShareLink: (text: string) => copyShareLinkMock(text),
}));

import AiDoctorSessionIntegrityLedger from "@/components/AiDoctorSessionIntegrityLedger";

function renderLedger() {
  return render(
    <MemoryRouter>
      <AiDoctorSessionIntegrityLedger />
    </MemoryRouter>,
  );
}

const FULL_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const GROW_ID = "10000000-0000-0000-0000-000000000001";

function entry(overrides: Partial<AiDoctorLedgerEntry> = {}): AiDoctorLedgerEntry {
  return {
    id: FULL_ID,
    timestampDisplay: "Jul 1, 2026, 12:00 PM",
    hasValidTimestamp: true,
    grow: { id: GROW_ID, label: "Flower Grow", archivedOrUnavailable: false },
    tent: { id: null, label: "—", archivedOrUnavailable: false },
    plant: { id: null, label: "—", archivedOrUnavailable: false },
    isPlantless: true,
    evidence: {
      tone: "healthy",
      label: "Healthy sensor evidence at save time",
      reasonLabel: "Recent reading",
      countsAsHealthy: true,
      evaluatedAtDisplay: "Jul 1, 2026, 11:59 AM",
      isLegacy: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  useAiDoctorSessionLedgerMock.mockReset();
  copyShareLinkMock.mockClear();
});

describe("AiDoctorSessionIntegrityLedger — loading state", () => {
  it("renders an accessible loading status", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const loading = screen.getByTestId("ai-doctor-session-integrity-ledger-loading");
    expect(loading.getAttribute("role")).toBe("status");
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });
});

describe("AiDoctorSessionIntegrityLedger — empty state", () => {
  it("renders an empty state when there are no entries on page 0", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    expect(screen.getByTestId("ai-doctor-session-integrity-ledger-empty")).toBeTruthy();
  });
});

describe("AiDoctorSessionIntegrityLedger — error + retry", () => {
  it("renders an error state and calls refetch on retry", () => {
    const refetch = vi.fn();
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("network"),
      refetch,
      isRefetching: false,
    });
    renderLedger();
    const errorBox = screen.getByTestId("ai-doctor-session-integrity-ledger-error");
    expect(errorBox.getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByTestId("ai-doctor-session-integrity-ledger-error-retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("AiDoctorSessionIntegrityLedger — privacy caption", () => {
  it("always states it is frozen evidence, not a new diagnosis or live status", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const caption = screen.getByTestId("ai-doctor-session-integrity-ledger-privacy-caption");
    expect(caption.textContent).toMatch(/does not run a new diagnosis/i);
    expect(caption.textContent).toMatch(/live telemetry/i);
    expect(caption.textContent).toMatch(/does not.*create actions/i);
  });
});

describe("AiDoctorSessionIntegrityLedger — entry rendering", () => {
  it("renders the session's timestamp, grow label, plantless plant, and evidence badge", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const table = screen.getByTestId("ai-doctor-session-integrity-ledger-table");
    expect(within(table).getByText("Jul 1, 2026, 12:00 PM")).toBeTruthy();
    expect(within(table).getByText("Flower Grow")).toBeTruthy();
    // Plantless: plant shows "—", never an "invalid" marker.
    const plantLabel = within(table).getByTestId("ai-doctor-session-integrity-ledger-plant-label");
    expect(plantLabel.getAttribute("data-plantless")).toBe("true");
    expect(plantLabel.getAttribute("data-archived")).toBe("false");
    expect(plantLabel.textContent).toContain("—");
    expect(within(table).getAllByText(/healthy sensor evidence/i).length).toBeGreaterThan(0);
    // "View session" link points at the existing detail page.
    const links = screen.getAllByTestId("ai-doctor-session-integrity-ledger-view-link");
    expect(links[0].getAttribute("href")).toBe(`/doctor/sessions/${FULL_ID}`);
  });

  it("renders 'Archived or unavailable' for an unresolved reference, never an invented name", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: {
        entries: [
          entry({
            grow: { id: GROW_ID, label: "Archived or unavailable", archivedOrUnavailable: true },
          }),
        ],
        page: 0,
        pageSize: 25,
        hasMore: false,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const table = screen.getByTestId("ai-doctor-session-integrity-ledger-table");
    const growLabel = within(table).getByTestId("ai-doctor-session-integrity-ledger-grow-label");
    expect(growLabel.getAttribute("data-archived")).toBe("true");
    expect(growLabel.textContent).toContain("Archived or unavailable");
    // The immutable id must still be present (technical-ID view), not dropped.
    expect(
      within(growLabel).getByTestId("ai-doctor-session-integrity-ledger-grow-id"),
    ).toBeTruthy();
  });

  it("renders legacy-evidence wording distinctly from a healthy/cautionary/unsafe/missing tone", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: {
        entries: [
          entry({
            evidence: {
              tone: "legacy",
              label: "Legacy session — no frozen sensor-evidence classification recorded",
              reasonLabel: null,
              countsAsHealthy: null,
              evaluatedAtDisplay: null,
              isLegacy: true,
            },
          }),
        ],
        page: 0,
        pageSize: 25,
        hasMore: false,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    expect(screen.getAllByText(/legacy session/i).length).toBeGreaterThan(0);
  });

  it("never renders an 'invalid session' marker anywhere in the DOM", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    const { container } = renderLedger();
    expect(container.textContent).not.toMatch(/invalid session/i);
  });
});

describe("AiDoctorSessionIntegrityLedger — technical IDs toggle + copy", () => {
  it("defaults to truncated ids and reveals the full id after toggling", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const before = screen.getAllByTestId("ai-doctor-session-integrity-ledger-session-id-value")[0];
    expect(before.textContent).not.toBe(FULL_ID);
    expect(before.textContent).toMatch(/…$/);

    fireEvent.click(screen.getByTestId("ai-doctor-session-integrity-ledger-toggle-technical"));

    const after = screen.getAllByTestId("ai-doctor-session-integrity-ledger-session-id-value")[0];
    expect(after.textContent).toBe(FULL_ID);
  });

  it("clicking a per-value copy button copies that exact id and shows a transient confirmation", async () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const copyButtons = screen.getAllByTestId("ai-doctor-session-integrity-ledger-session-id-copy");
    fireEvent.click(copyButtons[0]);
    expect(copyShareLinkMock).toHaveBeenCalledWith(FULL_ID);
    await waitFor(() => {
      expect(
        screen.getAllByTestId("ai-doctor-session-integrity-ledger-session-id-copied").length,
      ).toBeGreaterThan(0);
    });
  });
});

describe("AiDoctorSessionIntegrityLedger — pager", () => {
  it("Previous is disabled on page 0; Next is disabled when hasMore is false", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    expect(
      (screen.getByTestId("ai-doctor-session-integrity-ledger-prev") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("ai-doctor-session-integrity-ledger-next") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Next is enabled when hasMore is true, and advances the requested page", () => {
    useAiDoctorSessionLedgerMock.mockReturnValue({
      data: { entries: [entry()], page: 0, pageSize: 25, hasMore: true },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    });
    renderLedger();
    const next = screen.getByTestId("ai-doctor-session-integrity-ledger-next") as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    // Hook is called again with the advanced page number.
    const lastCallArgs = useAiDoctorSessionLedgerMock.mock.calls.at(-1);
    expect(lastCallArgs?.[0]).toBe(1);
  });
});

describe("AiDoctorSessionIntegrityLedger — safety", () => {
  it("never re-runs AI, never invokes edge functions, never mutates action_queue/alerts", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../src/components/AiDoctorSessionIntegrityLedger.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
    expect(src).not.toMatch(/action_queue|from\(["']alerts["']\)/);
  });
});
