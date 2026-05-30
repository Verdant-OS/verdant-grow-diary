/**
 * Tests for AI Doctor Sessions index filters: pure helpers, hook query
 * application, and page UI.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import {
  DEFAULT_FILTERS,
  dateRangeSince,
  formatActiveFilterLabels,
  isFiltersActive,
  parseDateRange,
  parseFilters,
  parseHasActions,
  parseRisk,
} from "@/lib/aiDoctorSessionsIndexFilters";

// ---- Pure helper tests ----

describe("aiDoctorSessionsIndexFilters — pure helpers", () => {
  it("default filter state is all/all/all", () => {
    expect(DEFAULT_FILTERS).toEqual({
      risk: "all",
      hasActions: "all",
      dateRange: "all",
    });
  });

  it("parses valid risk values", () => {
    for (const v of ["low", "medium", "high", "critical", "all"] as const) {
      expect(parseRisk(v)).toBe(v);
    }
  });

  it("normalizes invalid risk values to 'all'", () => {
    expect(parseRisk("bogus")).toBe("all");
    expect(parseRisk(undefined)).toBe("all");
    expect(parseRisk(null)).toBe("all");
    expect(parseRisk(42)).toBe("all");
  });

  it("normalizes invalid has-actions values to 'all'", () => {
    expect(parseHasActions("yes")).toBe("yes");
    expect(parseHasActions("nope")).toBe("all");
  });

  it("normalizes invalid date range values to 'all'", () => {
    expect(parseDateRange("7d")).toBe("7d");
    expect(parseDateRange("30d")).toBe("30d");
    expect(parseDateRange("90d")).toBe("all");
  });

  it("parseFilters merges defaults for missing/invalid fields", () => {
    expect(parseFilters({ risk: "high" })).toEqual({
      risk: "high",
      hasActions: "all",
      dateRange: "all",
    });
    expect(parseFilters({ risk: "bogus", hasActions: "yes", dateRange: "7d" })).toEqual({
      risk: "all",
      hasActions: "yes",
      dateRange: "7d",
    });
  });

  it("dateRangeSince('7d') computes deterministic boundary with injected now", () => {
    const now = new Date("2026-05-30T12:00:00.000Z");
    const since = dateRangeSince("7d", now);
    expect(since?.toISOString()).toBe("2026-05-23T12:00:00.000Z");
  });

  it("dateRangeSince('30d') computes deterministic boundary with injected now", () => {
    const now = new Date("2026-05-30T12:00:00.000Z");
    const since = dateRangeSince("30d", now);
    expect(since?.toISOString()).toBe("2026-04-30T12:00:00.000Z");
  });

  it("dateRangeSince('all') returns null", () => {
    expect(dateRangeSince("all", new Date())).toBeNull();
  });

  it("formatActiveFilterLabels returns visible labels", () => {
    expect(
      formatActiveFilterLabels({ risk: "high", hasActions: "yes", dateRange: "7d" }),
    ).toEqual(["Risk: High", "Has suggested actions", "Last 7 days"]);
    expect(
      formatActiveFilterLabels({ risk: "all", hasActions: "no", dateRange: "30d" }),
    ).toEqual(["No suggested actions", "Last 30 days"]);
    expect(formatActiveFilterLabels(DEFAULT_FILTERS)).toEqual([]);
  });

  it("isFiltersActive detects any non-default value", () => {
    expect(isFiltersActive(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltersActive({ ...DEFAULT_FILTERS, risk: "high" })).toBe(true);
    expect(isFiltersActive({ ...DEFAULT_FILTERS, hasActions: "no" })).toBe(true);
    expect(isFiltersActive({ ...DEFAULT_FILTERS, dateRange: "7d" })).toBe(true);
  });
});

// ---- Hook query application ----

const eqSpy = vi.fn();
const notSpy = vi.fn();
const gteSpy = vi.fn();
const rangeSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const orderSpy = vi.fn(() => ({ range: rangeSpy }));

type Builder = {
  eq: (col: string, val: unknown) => Builder;
  not: (col: string, op: string, val: unknown) => Builder;
  gte: (col: string, val: unknown) => Builder;
  order: typeof orderSpy;
};

const makeBuilder = (): Builder => {
  const b: Builder = {
    eq: (col, val) => {
      eqSpy(col, val);
      return b;
    },
    not: (col, op, val) => {
      notSpy(col, op, val);
      return b;
    },
    gte: (col, val) => {
      gteSpy(col, val);
      return b;
    },
    order: orderSpy,
  };
  return b;
};

const selectSpy = vi.fn(() => makeBuilder());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: selectSpy }),
  },
}));

import AiDoctorSessionsIndex from "@/pages/AiDoctorSessionsIndex";

function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useAiDoctorSessionsIndex — filter application", () => {
  it("applies risk filter via diagnosis->>riskLevel BEFORE pagination", async () => {
    eqSpy.mockClear();
    rangeSpy.mockClear();
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");

    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-risk"), {
      target: { value: "high" },
    });
    await flush();
    expect(eqSpy).toHaveBeenCalledWith("diagnosis->>riskLevel", "high");
    // pagination is the final range call
    expect(rangeSpy).toHaveBeenCalledWith(0, 25);
  });

  it("applies has-actions=yes via .not(suggested_actions, eq, '[]')", async () => {
    notSpy.mockClear();
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");

    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-has-actions"), {
      target: { value: "yes" },
    });
    await flush();
    expect(notSpy).toHaveBeenCalledWith("suggested_actions", "eq", "[]");
  });

  it("applies has-actions=no via .eq(suggested_actions, '[]')", async () => {
    eqSpy.mockClear();
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");

    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-has-actions"), {
      target: { value: "no" },
    });
    await flush();
    expect(eqSpy).toHaveBeenCalledWith("suggested_actions", "[]");
  });

  it("applies date range filter via .gte(created_at, …) BEFORE pagination", async () => {
    gteSpy.mockClear();
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");

    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-date-range"), {
      target: { value: "7d" },
    });
    await flush();
    expect(gteSpy).toHaveBeenCalled();
    const [col, val] = gteSpy.mock.calls[gteSpy.mock.calls.length - 1];
    expect(col).toBe("created_at");
    expect(typeof val).toBe("string");
    expect(val).toMatch(/T.*Z$/);
  });
});

// ---- Page UI ----

describe("AiDoctorSessionsIndex — filter UI", () => {
  it("renders all three filter controls and no active filters by default", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");
    expect(screen.getByTestId("ai-doctor-sessions-index-filters")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-sessions-index-filter-risk")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-sessions-index-filter-has-actions")).toBeTruthy();
    expect(screen.getByTestId("ai-doctor-sessions-index-filter-date-range")).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-sessions-index-active-filters")).toBeNull();
    expect(screen.queryByTestId("ai-doctor-sessions-index-clear-filters")).toBeNull();
  });

  it("renders active filter labels and clear button when filters are active", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");

    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-risk"), {
      target: { value: "high" },
    });
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-date-range"), {
      target: { value: "30d" },
    });
    expect(screen.getByTestId("ai-doctor-sessions-index-active-filters")).toBeTruthy();
    const labels = screen.getAllByTestId("ai-doctor-sessions-index-active-filter-label");
    const text = labels.map((n) => n.textContent).join("|");
    expect(text).toMatch(/Risk: High/);
    expect(text).toMatch(/Last 30 days/);
    expect(screen.getByTestId("ai-doctor-sessions-index-clear-filters")).toBeTruthy();
  });

  it("clear filters resets state and removes active filter labels", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");

    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-risk"), {
      target: { value: "high" },
    });
    expect(screen.getByTestId("ai-doctor-sessions-index-active-filters")).toBeTruthy();

    fireEvent.click(screen.getByTestId("ai-doctor-sessions-index-clear-filters"));
    expect(screen.queryByTestId("ai-doctor-sessions-index-active-filters")).toBeNull();
    expect(
      (screen.getByTestId("ai-doctor-sessions-index-filter-risk") as HTMLSelectElement).value,
    ).toBe("all");
  });

  it("renders unfiltered empty state when no sessions and no filters", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    expect(await screen.findByTestId("ai-doctor-sessions-index-empty")).toBeTruthy();
  });

  it("renders filtered empty state when filters are active and no rows match", async () => {
    renderWithProviders(<AiDoctorSessionsIndex />);
    await screen.findByTestId("ai-doctor-sessions-index-page");
    fireEvent.change(screen.getByTestId("ai-doctor-sessions-index-filter-risk"), {
      target: { value: "high" },
    });
    expect(
      await screen.findByTestId("ai-doctor-sessions-index-empty-filtered"),
    ).toBeTruthy();
    expect(screen.queryByTestId("ai-doctor-sessions-index-empty")).toBeNull();
  });
});

// ---- Static safety ----

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PAGE = read("src/pages/AiDoctorSessionsIndex.tsx");
const HOOK = read("src/hooks/use-ai-doctor-sessions.ts");
const LIB = read("src/lib/aiDoctorSessionsIndexFilters.ts");

describe("AiDoctorSessionsIndex filters — safety", () => {
  const ALL = [PAGE, HOOK, LIB].join("\n");

  it("no insert/update/delete/upsert in page, hook, or filter lib", () => {
    for (const src of [PAGE, HOOK, LIB]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  it("no Add-to-Queue or Run Doctor controls in page", () => {
    expect(PAGE).not.toMatch(/add[_ ]to[_ ]action[_ ]queue/i);
    expect(PAGE).not.toMatch(/run[_ ]doctor/i);
    expect(PAGE).not.toMatch(/runDoctor|runAi|generateDiagnosis|addToQueue/);
  });
  it("no functions.invoke or AI invocation", () => {
    expect(PAGE).not.toMatch(/functions\.invoke/);
    expect(PAGE).not.toMatch(/ai-coach/);
    expect(HOOK).not.toMatch(/functions\.invoke/);
    expect(LIB).not.toMatch(/functions\.invoke/);
  });
  it("no action_queue or alerts writes", () => {
    expect(ALL).not.toMatch(/from\(["']action_queue["']\)/);
    expect(ALL).not.toMatch(/from\(["']alerts["']\)/);
    expect(ALL).not.toMatch(/from\(["']alert_events["']\)/);
  });
  it("no service_role, automation, or device-control strings", () => {
    const lower = ALL.toLowerCase();
    expect(lower).not.toContain("service_role");
    for (const tok of [
      "mqtt",
      "auto-execute",
      "actuate",
      "device.command",
      "relay.on",
      "relay.off",
      "home-assistant",
      "home_assistant",
      "smart plug",
    ]) {
      expect(lower).not.toContain(tok);
    }
  });
});
