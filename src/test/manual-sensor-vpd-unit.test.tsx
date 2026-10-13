/**
 * Manual VPD unit toggle.
 *
 * hPa and mbar convert to canonical kPa before save (1 kPa = 10 hPa = 10 mbar).
 * Range checks run on the converted kPa value, and the rejection message stays
 * in the unit the grower selected. Default unit is kPa. The choice is not
 * stored in localStorage.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { applyManualVpdRangeGate, sameCanonicalManualVpd } from "@/lib/manualSensorVpdUnitRules";
import { validateManualEntry } from "@/lib/sensorReadingManualEntryRules";

const TENT = "11111111-1111-4111-8111-111111111111";
const FIRST_CAPTURED_AT = "2026-10-10T22:00:00.000Z";
const RETRY_CAPTURED_AT = "2026-10-10T22:05:00.000Z";
const insertedRows: unknown[] = [];
const insertPosts: unknown[][] = [];
let failInsertsRemaining = 0;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (row: unknown) => {
        const copy = JSON.parse(JSON.stringify(row)) as unknown;
        insertPosts.push(Array.isArray(copy) ? copy : [copy]);
        if (failInsertsRemaining > 0) {
          failInsertsRemaining -= 1;
          return { error: { message: "Failed to fetch" } };
        }
        insertedRows.push(row);
        return { error: null };
      },
    }),
  },
}));

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ManualSensorReadingCard tents={[{ id: TENT, name: "Tent A" }]} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function vpdInput() {
  return screen.getByLabelText(/^VPD/i) as HTMLInputElement;
}

async function confirmSave() {
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
  for (let i = 0; i < 25 && insertedRows.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function savedVpd(): number | undefined {
  const flattened = insertedRows.flatMap((row) => (Array.isArray(row) ? row : [row]));
  const match = flattened.find((row) => (row as { metric?: string }).metric === "vpd_kpa") as
    { value?: number } | undefined;
  return match?.value;
}

function vpdPosts(): { captured_at?: string; ts?: string; value?: number }[] {
  return insertPosts.map((post) => {
    const match = post.find((row) => (row as { metric?: string }).metric === "vpd_kpa") as
      { captured_at?: string; ts?: string; value?: number } | undefined;
    if (!match) throw new Error("vpd row missing from insert");
    return match;
  });
}

async function saveUntilUnconfirmed() {
  fireEvent.click(screen.getByTestId("manual-reading-save"));
  fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
  await screen.findByTestId("manual-reading-save-unconfirmed");
}

function resetInserts() {
  insertedRows.length = 0;
  insertPosts.length = 0;
  failInsertsRemaining = 0;
}

describe("ManualSensorReadingCard VPD units", () => {
  it("defaults to kPa and saves that number unchanged", async () => {
    insertedRows.length = 0;
    renderCard();
    expect(
      screen.getByTestId("manual-reading-vpd-unit-toggle").getAttribute("data-active-unit"),
    ).toBe("kPa");
    fireEvent.change(vpdInput(), { target: { value: "1.2" } });
    await confirmSave();
    expect(savedVpd()).toBe(1.2);
  });

  it("saves an hPa entry as canonical kPa", async () => {
    insertedRows.length = 0;
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-hPa"));
    fireEvent.change(vpdInput(), { target: { value: "15" } });
    await confirmSave();
    expect(savedVpd()).toBe(1.5);
  });

  it("saves an mbar entry as canonical kPa", async () => {
    insertedRows.length = 0;
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-mbar"));
    fireEvent.change(vpdInput(), { target: { value: "15" } });
    await confirmSave();
    expect(savedVpd()).toBe(1.5);
  });

  it("rejects an hPa value that is outside the range after conversion to kPa", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-hPa"));
    fireEvent.change(vpdInput(), { target: { value: "1" } });
    const save = screen.getByTestId("manual-reading-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("manual-reading-errors").textContent ?? "").toMatch(
      /VPD 1 hPa is outside the accepted range \(2–25 hPa\)/,
    );
  });

  it("rejects an mbar value that is outside the range after conversion to kPa", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-mbar"));
    fireEvent.change(vpdInput(), { target: { value: "30" } });
    const save = screen.getByTestId("manual-reading-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("manual-reading-errors").textContent ?? "").toMatch(
      /VPD 30 mbar is outside the accepted range \(2–25 mbar\)/,
    );
  });
});

describe("manual VPD unit toggle pending save", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetInserts();
  });

  it("keeps the pending snapshot identity when a unit round trip does not change kPa", async () => {
    resetInserts();
    failInsertsRemaining = 1;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIRST_CAPTURED_AT);
    renderCard();
    fireEvent.change(vpdInput(), { target: { value: "1.20" } });
    await saveUntilUnconfirmed();
    expect(vpdPosts()).toHaveLength(1);

    vi.setSystemTime(RETRY_CAPTURED_AT);
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-hPa"));
    expect(vpdInput().value).toBe("12");
    fireEvent.click(screen.getByTestId("manual-reading-vpd-unit-kPa"));
    expect(vpdInput().value).toBe("1.20");

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await screen.findByTestId("manual-reading-saved-confirmation");

    const posts = vpdPosts();
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(posts[0]?.captured_at).toBe(FIRST_CAPTURED_AT);
    expect(posts[1]?.captured_at).toBe(posts[0]?.captured_at);
    expect(new Set(posts.map((post) => post.captured_at)).size).toBe(1);
    expect(savedVpd()).toBe(1.2);
  });

  it.each([
    ["seven decimal places", "1.2345678"],
    ["more than seven decimal places", "1.234567890123"],
  ])("keeps one pending payload when %s round-trips through the units", async (_label, typed) => {
    resetInserts();
    failInsertsRemaining = 1;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIRST_CAPTURED_AT);
    renderCard();
    fireEvent.change(vpdInput(), { target: { value: typed } });
    await saveUntilUnconfirmed();
    expect(vpdPosts()).toHaveLength(1);

    vi.setSystemTime(RETRY_CAPTURED_AT);
    for (const unit of ["hPa", "mbar", "kPa", "hPa", "kPa"]) {
      fireEvent.click(screen.getByTestId(`manual-reading-vpd-unit-${unit}`));
    }
    expect(vpdInput().value).toBe(typed);

    fireEvent.click(screen.getByTestId("manual-sensor-review-confirm"));
    await screen.findByTestId("manual-reading-saved-confirmation");

    const posts = vpdPosts();
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(posts[0]?.value).toBe(Number(typed));
    expect(posts[1]?.value).toBe(Number(typed));
    expect(savedVpd()).toBe(Number(typed));
    expect(new Set(posts.map((post) => post.captured_at)).size).toBe(1);
  });

  it("saves the originally entered kPa after unit toggles", async () => {
    resetInserts();
    renderCard();
    fireEvent.change(vpdInput(), { target: { value: "1.2345678" } });
    for (const unit of ["hPa", "mbar", "kPa", "hPa", "kPa"]) {
      fireEvent.click(screen.getByTestId(`manual-reading-vpd-unit-${unit}`));
    }
    expect(vpdInput().value).toBe("1.2345678");
    await confirmSave();
    expect(savedVpd()).toBe(Number("1.2345678"));
  });

  it("resets the pending snapshot identity when the reading itself changes", async () => {
    resetInserts();
    failInsertsRemaining = 1;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIRST_CAPTURED_AT);
    renderCard();
    fireEvent.change(vpdInput(), { target: { value: "1.20" } });
    await saveUntilUnconfirmed();

    vi.setSystemTime(RETRY_CAPTURED_AT);
    fireEvent.change(vpdInput(), { target: { value: "1.30" } });
    await confirmSave();

    const posts = vpdPosts();
    expect(posts).toHaveLength(2);
    expect(posts[0]?.captured_at).toBe(FIRST_CAPTURED_AT);
    expect(posts[1]?.captured_at).toBe(RETRY_CAPTURED_AT);
    expect(posts[1]?.captured_at).not.toBe(posts[0]?.captured_at);
    expect(posts[1]?.value).toBe(1.3);
    expect(savedVpd()).toBe(1.3);
  });
});

describe("sameCanonicalManualVpd", () => {
  it("treats numerically equal kPa strings as the same reading", () => {
    expect(sameCanonicalManualVpd("1.20", "1.2")).toBe(true);
    expect(sameCanonicalManualVpd("1.20", "1.21")).toBe(false);
    expect(sameCanonicalManualVpd("", "")).toBe(true);
    expect(sameCanonicalManualVpd("1.2", "")).toBe(false);
  });
});

describe("applyManualVpdRangeGate", () => {
  it("strips an out-of-range converted VPD so it cannot be inserted", () => {
    const gated = applyManualVpdRangeGate(validateManualEntry({ vpdKpa: "0.1" }), "1", "hPa");
    expect(gated.ok).toBe(false);
    expect(gated.metrics.find((metric) => metric.metric === "vpd_kpa")).toBeUndefined();
    expect(gated.errors.join(" ")).toMatch(/1 hPa/);
  });

  it("keeps an in-range converted value on the canonical metric", () => {
    const gated = applyManualVpdRangeGate(validateManualEntry({ vpdKpa: "1.5" }), "15", "mbar");
    expect(gated.ok).toBe(true);
    expect(gated.metrics.find((metric) => metric.metric === "vpd_kpa")?.value).toBe(1.5);
  });
});
