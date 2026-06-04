/**
 * Timeline diary chip/photo enrichment — renders sensor chips and photo
 * thumbnails for Quick Log diary entries carrying `details.sensor` or
 * `details.photos`. Mocks Supabase for deterministic fetches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TimelineMemorySection from "@/components/TimelineMemorySection";

type Row = {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  entry_at: string;
  note: string | null;
  photo_url: string | null;
  details: unknown;
};

let nextResponse: { data: Row[] | null; error: unknown } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.not = () => q;
    q.order = () => q;
    q.limit = () => Promise.resolve(nextResponse);
    return q;
  }
  return { supabase: { from: () => makeQuery() } };
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TimelineMemorySection scope="plant" plantId="plant-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nextResponse = { data: [], error: null };
});

describe("Timeline diary chips + photo strip enrichment", () => {
  it("renders Temp/RH/VPD chips for a Quick Log with details.sensor", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-1",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-10T10:00:00.000Z",
          note: "Watered 500ml.",
          photo_url: null,
          details: {
            event_type: "watering",
            sensor: {
              temp_f: 75,
              humidity: 55,
              vpd: 1.2,
              source: "manual",
            },
          },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    expect(screen.getByTestId("timeline-diary-sensor-chip-temp_f")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-diary-sensor-chip-rh")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-diary-sensor-chip-vpd")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-diary-sensor-source").textContent).toBe(
      "Manual",
    );
    expect(
      screen.getByTestId("timeline-diary-sensor-chips").getAttribute("data-is-live"),
    ).toBe("no");
  });

  it("renders soil moisture and CO2 chips only when present", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-2",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-11T10:00:00.000Z",
          note: null,
          photo_url: null,
          details: {
            event_type: "note",
            sensor: { temp_c: 24, soil_moisture: 40, co2_ppm: 800 },
          },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    expect(
      screen.getByTestId("timeline-diary-sensor-chip-soil_moisture"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("timeline-diary-sensor-chip-co2")).toBeInTheDocument();
  });

  it("never promotes manual/csv/demo/stale/invalid to Live", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-3",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-12T10:00:00.000Z",
          note: null,
          photo_url: null,
          details: {
            event_type: "note",
            sensor: { temp_f: 75, source: "csv", vendor: "ecowitt" },
          },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    expect(screen.getByTestId("timeline-diary-sensor-source").textContent).toBe(
      "CSV",
    );
    const text =
      screen.getByTestId("timeline-memory-diary-item").textContent?.toLowerCase() ??
      "";
    expect(text).not.toMatch(/\blive\b/);
  });

  it("renders a safe 'unavailable' message for malformed sensor data", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-4",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-13T10:00:00.000Z",
          note: "ok",
          photo_url: null,
          details: {
            event_type: "note",
            sensor: { temp_f: "abc", humidity: null, vpd: Number.NaN },
          },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    expect(
      screen.getByTestId("timeline-diary-sensor-unavailable").textContent,
    ).toMatch(/unavailable/i);
    expect(
      screen.queryByTestId("timeline-diary-sensor-chip-temp_f"),
    ).not.toBeInTheDocument();
  });

  it("renders up to 3 photo thumbnails and +N more", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-5",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-14T10:00:00.000Z",
          note: "Photos",
          photo_url: null,
          details: {
            event_type: "note",
            photos: [
              "https://example.com/a.jpg",
              "https://example.com/b.jpg",
              "https://example.com/c.jpg",
              "https://example.com/d.jpg",
              "https://example.com/e.jpg",
            ],
          },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    expect(screen.getAllByTestId("timeline-diary-photo-thumb")).toHaveLength(3);
    expect(screen.getByTestId("timeline-diary-photo-more").textContent).toBe(
      "+2 more",
    );
  });

  it("does not render broken images when photo URLs are missing/invalid", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-6",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-15T10:00:00.000Z",
          note: "broken",
          photo_url: null,
          details: {
            event_type: "note",
            photos: ["", "not-a-url", { nope: true }],
          },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    expect(
      screen.queryByTestId("timeline-diary-photo-thumb"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("timeline-diary-photo-strip"),
    ).not.toBeInTheDocument();
  });

  it("thumbnail alt text includes event type and occurredAt context", async () => {
    nextResponse = {
      data: [
        {
          id: "qlog-7",
          plant_id: "plant-1",
          tent_id: "tent-1",
          entry_at: "2026-01-16T10:00:00.000Z",
          note: null,
          photo_url: "https://example.com/solo.jpg",
          details: { event_type: "watering" },
        },
      ],
      error: null,
    };
    renderSection();
    await waitFor(() => screen.getByTestId("timeline-memory-diary-item"));
    const img = screen.getByTestId("timeline-diary-photo-thumb") as HTMLImageElement;
    expect(img.alt).toContain("watering");
    expect(img.alt).toContain("2026-01-16T10:00:00.000Z");
  });
});
