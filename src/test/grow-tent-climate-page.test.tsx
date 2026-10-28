import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));

const storage = vi.hoisted(() => ({
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
}));

vi.mock("@/lib/growTentClimateAnalytics", () => ({
  trackClimateToolEvent: vi.fn(),
}));

import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { trackClimateToolEvent } from "@/lib/growTentClimateAnalytics";
import {
  GROW_TENT_CLIMATE_CTA_HREF,
  GROW_TENT_CLIMATE_FAQ,
  GROW_TENT_CLIMATE_H1,
  GROW_TENT_CLIMATE_PATH,
} from "@/lib/growTentClimateRules";
import GrowTentTemperatureHumidityChart from "@/pages/GrowTentTemperatureHumidityChart";

function renderPage() {
  return render(
    <MemoryRouter>
      <GrowTentTemperatureHumidityChart />
    </MemoryRouter>,
  );
}

function climateDocument() {
  const doc = STATIC_PUBLIC_SEO_DOCUMENTS.find((entry) => entry.path === GROW_TENT_CLIMATE_PATH);
  if (!doc) throw new Error("missing static document");
  return doc;
}

const calls = (name: string) =>
  vi.mocked(trackClimateToolEvent).mock.calls.filter(([event]) => event === name);

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const logTable = () => screen.getByRole("region", { name: "Climate reading log table" });

describe("public grow tent temperature and humidity page", () => {
  let now = 10_000;

  beforeEach(() => {
    vi.mocked(trackClimateToolEvent).mockClear();
    storage.setItem.mockClear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("fetch", vi.fn());
    now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the H1, the FAQ and three CTAs to the guide's signup URL", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: GROW_TENT_CLIMATE_H1 }),
    ).toBeInTheDocument();
    for (const entry of GROW_TENT_CLIMATE_FAQ) {
      expect(screen.getByText(entry.question)).toBeInTheDocument();
      expect(screen.getByText(entry.answer)).toBeInTheDocument();
    }
    const ctas = screen.getAllByRole("link", { name: "Keep this log in Verdant →" });
    expect(ctas.map((link) => link.getAttribute("href"))).toEqual([
      GROW_TENT_CLIMATE_CTA_HREF,
      GROW_TENT_CLIMATE_CTA_HREF,
      GROW_TENT_CLIMATE_CTA_HREF,
    ]);
    expect(ctas.map((link) => link.getAttribute("data-cta-location"))).toEqual([
      "tool",
      "article",
      "footer",
    ]);
    expect(screen.getAllByRole("link", { name: /VPD chart/ }).length).toBeGreaterThanOrEqual(2);
  });

  it("emits the visible FAQ word for word as FAQPage JSON-LD, with no ratings", () => {
    renderPage();
    const jsonLd = climateDocument().metadata.jsonLd ?? [];
    const faq = jsonLd.find((node) => (node as { "@type"?: string })["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    const section = document.getElementById("grow-tent-temperature-and-humidity-faq")!;
    const visible = [...section.querySelectorAll("details")].map((details) => ({
      question: details.querySelector("summary")?.textContent,
      answer: details.querySelector("p")?.textContent,
    }));
    expect(
      faq.mainEntity.map((entry) => ({ question: entry.name, answer: entry.acceptedAnswer.text })),
    ).toEqual(visible);
    const types = jsonLd.map((node) => (node as { "@type"?: string })["@type"]);
    for (const type of ["Article", "FAQPage", "WebApplication", "BreadcrumbList"]) {
      expect(types).toContain(type);
    }
    expect(JSON.stringify(jsonLd)).not.toMatch(/aggregateRating|"review"/i);
  });

  it("shows the live VPD for the defaults and logs a reading in memory only", () => {
    renderPage();
    const result = screen.getByTestId("climate-live-result");
    expect(within(result).getByText("1.06 kPa")).toBeInTheDocument();
    expect(within(result).getAllByText("Within your Veg band").length).toBeGreaterThan(0);
    expect(result).toHaveTextContent("62% RH (centers at 1.00 kPa midpoint");
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    expect(within(logTable()).getByText("1.06 kPa")).toBeInTheDocument();
    expect(screen.getByText(/Total readings: 1 — In band: 1/)).toBeInTheDocument();
    expect(calls("climate_tool_reading_logged").at(-1)?.[1]).toEqual({ reading_count: 1 });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the range message and logs nothing for an out-of-range input", () => {
    renderPage();
    setField("Air temperature (°F)", "120");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter Air temperature between 50°F and 100°F",
    );
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    expect(screen.getByText(/No climate readings logged yet/)).toBeInTheDocument();
    expect(calls("climate_tool_reading_logged")).toHaveLength(0);
  });

  it("throttles climate_tool_checked to one event per two seconds", () => {
    renderPage();
    expect(calls("climate_tool_checked")).toHaveLength(0);
    setField("Relative humidity (%)", "61");
    setField("Relative humidity (%)", "62");
    now += 1999;
    setField("Relative humidity (%)", "75");
    expect(calls("climate_tool_checked")).toHaveLength(1);
    expect(calls("climate_tool_checked")[0][1]).toEqual({ stage: "veg", status: "in_band" });
    now += 1;
    setField("Relative humidity (%)", "76");
    expect(calls("climate_tool_checked")).toHaveLength(2);
    expect(calls("climate_tool_checked")[1][1]).toEqual({ stage: "veg", status: "below" });
  });

  it("opens the humidity-too-high fixes for a humid reading without a fix_opened event", () => {
    renderPage();
    const rhHigh = () => document.querySelector('details[data-problem="rh_high"]')!;
    expect(rhHigh()).not.toHaveAttribute("open");
    setField("Relative humidity (%)", "80");
    expect(rhHigh()).toHaveAttribute("open");
    expect(calls("climate_tool_fix_opened")).toHaveLength(0);
    fireEvent.click(screen.getByText("Temperature too high (tent running hot in °F)"));
    expect(calls("climate_tool_fix_opened")).toEqual([
      ["climate_tool_fix_opened", { problem: "temp_high" }],
    ]);
  });

  it("prints inside a visible print section and keeps blank mode until afterprint", () => {
    vi.useFakeTimers();
    const print = vi.fn();
    vi.stubGlobal("print", print);
    renderPage();
    expect(screen.getByTestId("grow-tent-climate-page")).toHaveAttribute(
      "data-print-section",
      "public-guide-tool",
    );
    fireEvent.click(screen.getByRole("button", { name: "Print blank log sheet" }));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(print).toHaveBeenCalledTimes(1);
    const sheet = screen.getByText(
      "Verdant Grow Diary — Blank Tent Climate Log Sheet",
    ).parentElement;
    expect(sheet?.className).toContain("print:block");
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(sheet?.className).not.toContain("print:block");
    vi.useRealTimers();
  });

  it("says no RH reaches the band instead of showing a clamped RH", () => {
    renderPage();
    setField("Air temperature (°F)", "50");
    setField("Leaf temperature offset (°F)", "-10");
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "late_flower" } });
    const result = screen.getByTestId("climate-live-result");
    expect(result).toHaveTextContent("no RH from 0 to 100% reaches the 1.40 kPa midpoint");
    expect(result).not.toHaveTextContent("0% RH (centers at");
  });

  it("discloses that the VPD calculator's late-flower band differs", () => {
    renderPage();
    expect(document.body).toHaveTextContent(
      "Our VPD calculator uses a different late-flower band: This chart preserves",
    );
  });

  it("stamps each logged reading with the time it was logged, not page load", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 28, 8, 0));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    vi.setSystemTime(new Date(2026, 9, 28, 20, 30));
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    expect(within(logTable()).getByText("2026-10-28 08:00")).toBeInTheDocument();
    expect(within(logTable()).getByText("2026-10-28 20:30")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("drops a stale clipboard fallback once the log changes", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy log" }));
    });
    expect(screen.getByLabelText(/Clipboard access was unavailable/)).toHaveValue(
      "Date & Time\tLights\tAir Temp (°F)\tRH (%)\tLeaf Offset (°F)\tStage\tVPD (kPa)\tStatus\tNote",
    );
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    expect(screen.queryByLabelText(/Clipboard access was unavailable/)).not.toBeInTheDocument();
  });

  it("clears only after confirmation and restores the default inputs", () => {
    renderPage();
    setField("Relative humidity (%)", "80");
    fireEvent.click(screen.getByRole("button", { name: "Log this reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear log" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(screen.getByText(/No climate readings logged yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("Relative humidity (%)")).toHaveValue(60);
    expect(calls("climate_tool_clear")).toHaveLength(1);
  });
});
