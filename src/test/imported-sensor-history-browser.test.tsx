import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ImportedSensorHistorySelection } from "@/lib/importedSensorHistoryPageRules";
import type { ImportedSensorHistoryPageRow } from "@/hooks/useImportedSensorHistoryPage";

interface PageQueryState {
  data?: { rows: ImportedSensorHistoryPageRow[]; total: number };
  isSuccess: boolean;
  isFetching: boolean;
  isPaused: boolean;
  isError: boolean;
  refetch: () => unknown;
}

const mocks = vi.hoisted(() => ({
  userId: "owner-A" as string | null,
  usePage: vi.fn(),
  queries: new Map<string, PageQueryState>(),
  refetch: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));

vi.mock("@/hooks/useImportedSensorHistoryPage", () => ({
  useImportedSensorHistoryPage: mocks.usePage,
}));

import ImportedSensorHistoryBrowser from "@/components/ImportedSensorHistoryBrowser";

const initialSelection = (): ImportedSensorHistorySelection => ({
  fromDate: "",
  throughDate: "",
  page: 0,
});

function queryKey(
  tentId: string,
  selection: ImportedSensorHistorySelection,
  userId = mocks.userId,
): string {
  return JSON.stringify([userId, tentId, selection.fromDate, selection.throughDate, selection.page]);
}

function rows(
  count = 50,
  options: { tentId?: string; metric?: string; newestAt?: string } = {},
): ImportedSensorHistoryPageRow[] {
  const { tentId = "tent-A", metric = "temperature_c", newestAt = "2026-10-24T00:00:00Z" } = options;
  return Array.from({ length: count }, (_, index) => {
    const capturedAt = new Date(Date.parse(newestAt) - index * 300_000).toISOString();
    return {
      id: `${tentId}-${metric}-${index}`,
      tent_id: tentId,
      source: "csv",
      metric,
      value: 22,
      quality: "ok",
      captured_at: capturedAt,
      ts: capturedAt,
      created_at: "2026-10-24T12:00:00Z",
    };
  });
}

function successfulPage(
  pageRows = rows(),
  total = 33_655,
  overrides: Partial<PageQueryState> = {},
): PageQueryState {
  return {
    data: { rows: pageRows, total },
    isSuccess: true,
    isFetching: false,
    isPaused: false,
    isError: false,
    refetch: mocks.refetch,
    ...overrides,
  };
}

function setPage(
  page: number,
  query = successfulPage(),
  options: { tentId?: string; userId?: string; fromDate?: string; throughDate?: string } = {},
) {
  mocks.queries.set(
    queryKey(options.tentId ?? "tent-A", {
      fromDate: options.fromDate ?? "",
      throughDate: options.throughDate ?? "",
      page,
    }, options.userId ?? mocks.userId),
    query,
  );
}

function openBrowser() {
  fireEvent.click(screen.getByRole("button", { name: "Browse older CSV readings" }));
}

function expectSelection(selection: ImportedSensorHistorySelection, tentId = "tent-A") {
  expect(mocks.usePage).toHaveBeenLastCalledWith(tentId, selection);
}

function enterDates(fromDate: string, throughDate: string) {
  fireEvent.change(screen.getByLabelText("From date (UTC)"), { target: { value: fromDate } });
  fireEvent.change(screen.getByLabelText("Through date (UTC)"), { target: { value: throughDate } });
  fireEvent.click(screen.getByRole("button", { name: "Show dates" }));
}

beforeEach(() => {
  mocks.userId = "owner-A";
  mocks.queries.clear();
  mocks.refetch.mockReset();
  mocks.usePage.mockReset();
  mocks.usePage.mockImplementation((tentId: string, selection: ImportedSensorHistorySelection) =>
    mocks.queries.get(queryKey(tentId, selection)) ?? {
      isSuccess: false,
      isFetching: true,
      isPaused: false,
      isError: false,
      refetch: mocks.refetch,
    },
  );
  setPage(0);
});

describe("ImportedSensorHistoryBrowser", () => {
  it("starts closed without invoking the additional history query", () => {
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);

    expect(screen.getByRole("button", { name: "Browse older CSV readings" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByLabelText("CSV history browser")).not.toBeInTheDocument();
    expect(mocks.usePage).not.toHaveBeenCalled();
  });

  it("displays all 50 page rows with the real selection count and observation window", () => {
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();

    const table = screen.getByRole("table", { name: "Selected CSV history page" });
    expect(within(table).getAllByRole("row")).toHaveLength(51);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Metric readings 1\u201350 of 33655 available in this selection. Page 1 of 674.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("More older readings are available.");
    expect(screen.getByText(/Displayed observation window:/)).toHaveTextContent(
      "2026-10-23 19:55:00.000 UTC to 2026-10-24 00:00:00.000 UTC",
    );
    expect(screen.getByText(/Browse imported history/)).toHaveTextContent("Source: CSV");
    expect(screen.getByText(/Browse imported history/)).toHaveTextContent("Not live data");
    expect(screen.getByText(/Browse 50 metric readings at a time/)).toHaveTextContent(
      "Several metric readings can share one observation time.",
    );
    expect(screen.getByRole("button", { name: "Newest" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    expectSelection(initialSelection());
  });

  it("retrieves successive older pages and returns to the newest page", () => {
    setPage(1, successfulPage(rows(50, { newestAt: "2026-10-23T19:50:00Z" })));
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();

    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    expectSelection({ ...initialSelection(), page: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("Metric readings 51\u2013100 of 33655");
    expect(screen.getByText(/Displayed observation window:/)).toHaveTextContent(
      "2026-10-23 19:50:00.000 UTC",
    );

    fireEvent.click(screen.getByRole("button", { name: "Newest" }));
    expectSelection(initialSelection());
    expect(screen.getByRole("status")).toHaveTextContent("Metric readings 1\u201350 of 33655");
  });

  it("opens the beginning of a large import without traversing every page", () => {
    setPage(673, successfulPage(rows(5, { newestAt: "2026-09-23T00:20:00Z" })));
    setPage(672, successfulPage(rows(50, { newestAt: "2026-09-23T04:30:00Z" })));
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();

    fireEvent.click(screen.getByRole("button", { name: "Oldest" }));
    expectSelection({ ...initialSelection(), page: 673 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Metric readings 33651\u201333655 of 33655 available in this selection. Page 674 of 674.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("No older readings in this selection.");
    expect(screen.getByText(/Displayed observation window:/)).toHaveTextContent(
      "2026-09-23 00:00:00.000 UTC to 2026-09-23 00:20:00.000 UTC",
    );
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Oldest" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Newer" }));
    expectSelection({ ...initialSelection(), page: 672 });
    fireEvent.click(screen.getByRole("button", { name: "Newest" }));
    expectSelection(initialSelection());
  });

  it("opens a middle date window inclusively and resets the current page", () => {
    setPage(1);
    setPage(0, successfulPage(rows(3, { newestAt: "2026-10-08T12:00:00Z" }), 3), {
      fromDate: "2026-10-08", throughDate: "2026-10-08",
    });
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));

    enterDates("2026-10-08", "2026-10-08");

    expectSelection({ fromDate: "2026-10-08", throughDate: "2026-10-08", page: 0 });
    expect(screen.getByText(/Selected window:/)).toHaveTextContent(
      "2026-10-08 through 2026-10-08 (UTC).",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Metric readings 1\u20133 of 3 available in this selection.",
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText(/Displayed observation window:/)).toHaveTextContent(
      "2026-10-08 12:00:00.000 UTC",
    );
  });

  it("rejects reversed dates while preserving the last applied window and page", () => {
    setPage(1);
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));

    enterDates("2026-10-24", "2026-09-23");

    expect(screen.getByRole("alert")).toHaveTextContent("From date must be on or before Through date.");
    expectSelection({ ...initialSelection(), page: 1 });
    expect(screen.getByText(/Selected window:/)).toHaveTextContent(
      "earliest available through latest available (UTC).",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Metric readings 51\u2013100 of 33655");
  });

  it("clears applied dates and validation errors using All available dates", () => {
    setPage(0, successfulPage(rows(2), 2), { fromDate: "2026-09-23", throughDate: "2026-09-24" });
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    enterDates("2026-09-23", "2026-09-24");
    enterDates("2026-10-24", "2026-09-23");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All available dates" }));

    expectSelection(initialSelection());
    expect(screen.getByLabelText("From date (UTC)")).toHaveValue("");
    expect(screen.getByLabelText("Through date (UTC)")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Metric readings 1\u201350 of 33655");
  });

  it.each([
    ["initial loading", { isSuccess: false, isFetching: true }, "Loading CSV history page"],
    ["refreshing", { isFetching: true }, "Loading CSV history page"],
    ["paused", { isPaused: true }, "Waiting for a connection to browse CSV history"],
  ] as const)("does not show retained rows or totals while %s", (_name, flags, message) => {
    setPage(0, successfulPage(rows(), 33_655, flags));
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/33655/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Displayed observation window:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "CSV history pages" })).not.toBeInTheDocument();
  });

  it("hides retained data after a failed read and offers a page retry", () => {
    setPage(0, successfulPage(rows(), 33_655, { isSuccess: false, isError: true }));
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load this CSV history page. No complete-history count is available.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/33655/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry page" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it.each(["tent", "account"] as const)(
    "resets the selected page and clears previous rows when the %s changes",
    (context) => {
    setPage(1);
    const { rerender } = render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    expect(screen.getByRole("table")).toHaveTextContent("temperature_c");

    if (context === "tent") {
      rerender(<ImportedSensorHistoryBrowser tentId="tent-B" />);
      expectSelection(initialSelection(), "tent-B");
    } else {
      mocks.userId = "owner-B";
      rerender(<ImportedSensorHistoryBrowser tentId="tent-A" />);
      expectSelection(initialSelection());
    }

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/33655/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading CSV history page");

    const tentId = context === "tent" ? "tent-B" : "tent-A";
    setPage(0, successfulPage(rows(1, { tentId, metric: "humidity_pct" }), 1), { tentId });
    rerender(<ImportedSensorHistoryBrowser tentId={tentId} />);
    expect(screen.getByRole("table")).toHaveTextContent("humidity_pct");
    expect(screen.getByRole("table")).not.toHaveTextContent("temperature_c");
    expect(screen.getByRole("status")).toHaveTextContent("Metric readings 1\u20131 of 1");
    },
  );

  it("does not query while signed out and removes existing rows on sign-out", () => {
    mocks.userId = null;
    const { rerender } = render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    expect(screen.getByRole("status")).toHaveTextContent("Sign in to browse available CSV history.");
    expect(mocks.usePage).not.toHaveBeenCalled();

    mocks.userId = "owner-A";
    rerender(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    expect(screen.getByRole("table")).toBeInTheDocument();

    mocks.userId = null;
    rerender(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/33655/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sign in to browse available CSV history.");
  });

  it("describes an empty selected window without claiming the tent has no history", () => {
    setPage(0, successfulPage([], 0), { fromDate: "2026-10-01", throughDate: "2026-10-02" });
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    enterDates("2026-10-01", "2026-10-02");

    expect(screen.getByRole("status")).toHaveTextContent(
      "No available CSV readings in this selected window.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Older saved readings may be outside your account's history limit.",
    );
    expect(
      screen.queryByText("No CSV readings are available for this tent in the current history view."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    for (const name of ["Newest", "Newer", "Older", "Oldest"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });

  it("unmounts the browser on close and reopens at the newest page", () => {
    setPage(1);
    render(<ImportedSensorHistoryBrowser tentId="tent-A" />);
    openBrowser();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    const callsBeforeClose = mocks.usePage.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Close history browser" }));

    expect(screen.queryByLabelText("CSV history browser")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(mocks.usePage).toHaveBeenCalledTimes(callsBeforeClose);
    openBrowser();
    expectSelection(initialSelection());
    expect(screen.getByRole("status")).toHaveTextContent("Metric readings 1\u201350 of 33655");
  });
});
