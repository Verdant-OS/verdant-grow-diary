/**
 * tent-csv-import-card-mapping-drawer — rendering tests for the CSV import
 * mapping-help drawer that appears in both legacy and registry preview paths.
 *
 * Scope: read-only UI only. No DB I/O. No network. No Supabase writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TentCsvImportCard from "@/components/TentCsvImportCard";

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [{ id: "tent-1", name: "Veg Tent" }] }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const SPIDER_FARMER_CSV = [
  "deviceSerialnum,timestamp,temperature(°C),temperature(°F),humidity,vpd,co2,ppfd,ec",
  "SF123,2026-06-01 00:00:00,22.5,72.5,55,1.2,400,850,1.2",
  "SF123,2026-06-01 00:05:00,23.0,73.4,56,1.3,410,860,1.3",
].join("\n");

const AC_INFINITY_CSV = [
  "Timestamp,Temperature(°F),Humidity,VPD,CO2,EC,PPFD",
  "2026-06-01 00:00:00,72.5,55,1.2,400,1.2,850",
].join("\n");

describe("TentCsvImportCard mapping-help drawer — Spider Farmer / THP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drawer trigger appears after uploading a Spider Farmer CSV", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    File.prototype.text = originalText;
  });

  it("expanded drawer shows imported metrics for Spider Farmer", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-content")).toBeInTheDocument();
    });

    const imported = screen.getByTestId("csv-mapping-help-imported");
    expect(imported).toHaveTextContent("Temperature");
    expect(imported).toHaveTextContent("Humidity");
    expect(imported).toHaveTextContent("VPD");
    expect(imported).toHaveTextContent("CO₂");

    File.prototype.text = originalText;
  });

  it("expanded drawer shows detected-but-not-imported metrics: ec, ppfd", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-content")).toBeInTheDocument();
    });

    const notImported = screen.getByTestId("csv-mapping-help-not-imported");
    expect(notImported).toHaveTextContent("EC");
    expect(notImported).toHaveTextContent("PPFD");

    File.prototype.text = originalText;
  });

  it("drawer says CSV history is not live data", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-csv-not-live")).toHaveTextContent(
        /CSV history, not live sensor readings/,
      );
    });

    File.prototype.text = originalText;
  });

  it("drawer says preflight blocks unsupported fields before writing", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-preflight")).toHaveTextContent(
        /blocked before any rows are written/,
      );
    });

    File.prototype.text = originalText;
  });

  it("drawer does not render raw payload values", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-content")).toBeInTheDocument();
    });

    expect(screen.queryByText(/raw_payload/)).not.toBeInTheDocument();
    expect(screen.queryByText(/deviceSerialnum/)).not.toBeInTheDocument();

    File.prototype.text = originalText;
  });

  it("drawer does not enable import/convert buttons", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(SPIDER_FARMER_CSV);

    const file = new File([SPIDER_FARMER_CSV], "spider.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-content")).toBeInTheDocument();
    });

    // The drawer itself should not contain any buttons that convert or import
    const drawer = screen.getByTestId("csv-mapping-help-content");
    expect(drawer.querySelector("button")).toBeNull();

    File.prototype.text = originalText;
  });
});

describe("TentCsvImportCard mapping-help drawer — AC Infinity legacy path", () => {
  it("drawer trigger appears after parsing an AC Infinity CSV", async () => {
    render(wrap(<TentCsvImportCard tentId="tent-1" growId="grow-1" />));

    const fileInput = screen.getByTestId("csv-file-input");
    const originalText = File.prototype.text;
    File.prototype.text = vi.fn().mockResolvedValue(AC_INFINITY_CSV);

    const file = new File([AC_INFINITY_CSV], "ac.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-trigger")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("csv-mapping-help-trigger"));

    await waitFor(() => {
      expect(screen.getByTestId("csv-mapping-help-content")).toBeInTheDocument();
    });

    const imported = screen.getByTestId("csv-mapping-help-imported");
    expect(imported).toHaveTextContent("Temperature");
    expect(imported).toHaveTextContent("Humidity");
    expect(imported).toHaveTextContent("VPD");
    expect(imported).toHaveTextContent("CO₂");

    const notImported = screen.getByTestId("csv-mapping-help-not-imported");
    expect(notImported).toHaveTextContent("EC");
    expect(notImported).toHaveTextContent("PPFD");

    File.prototype.text = originalText;
  });
});
