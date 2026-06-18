/**
 * useTentPlantRosterActivity — data-hook tests.
 *
 * Confirms:
 *   - per-plant latest log + photo signals are scoped to the plant
 *   - other plants' diary entries never leak into the row
 *   - Harvest Watch v0 public state is included when derivable
 *   - hook never imports sensor_readings / AI / alerts / action queue
 *   - safe empty state when no plants
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";

import { useTentPlantRosterActivity } from "@/hooks/useTentPlantRosterActivity";

const mocks = vi.hoisted(() => ({
  diaryByPlant: new Map<string, unknown[]>(),
}));

vi.mock("@/integrations/supabase/client", () => {
  function build(plantId: string) {
    return {
      data: mocks.diaryByPlant.get(plantId) ?? [],
      error: null,
    };
  }
  function from(_table: string) {
    let plantId = "";
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, v: string) => {
        if (col === "plant_id") plantId = v;
        return builder;
      },
      order: () => builder,
      limit: () => Promise.resolve(build(plantId)),
    };
    return builder;
  }
  return { supabase: { from } };
});

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function diaryRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e",
    event_type: "quick_log",
    created_at: "2026-06-15T10:00:00.000Z",
    entry_at: "2026-06-15T10:00:00.000Z",
    note: "Trichome inspection",
    plant_id: "p1",
    tent_id: "t1",
    photo_url: null,
    ...over,
  };
}

beforeEach(() => {
  mocks.diaryByPlant.clear();
});

describe("useTentPlantRosterActivity", () => {
  it("returns empty map when no plants given", () => {
    const { result } = renderHook(() => useTentPlantRosterActivity([]), {
      wrapper: wrap(),
    });
    expect(result.current.byPlantId).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it("derives per-plant latest log + photo and does not leak across plants", async () => {
    mocks.diaryByPlant.set("p1", [
      diaryRow({ id: "a", plant_id: "p1", entry_at: "2026-06-15T10:00:00.000Z", created_at: "2026-06-15T10:00:00.000Z", photo_url: "https://x/y.jpg" }),
    ]);
    mocks.diaryByPlant.set("p2", [
      diaryRow({ id: "b", plant_id: "p2", entry_at: "2026-06-10T10:00:00.000Z", created_at: "2026-06-10T10:00:00.000Z", note: "pistil note", photo_url: null }),
    ]);

    const { result } = renderHook(
      () =>
        useTentPlantRosterActivity([
          { id: "p1", name: "Alpha", stage: "flower" },
          { id: "p2", name: "Beta", stage: "flower" },
        ]),
      { wrapper: wrap() },
    );

    await waitFor(() => {
      expect(result.current.byPlantId.p1?.latestLogAt).toBeTruthy();
      expect(result.current.byPlantId.p2?.latestLogAt).toBeTruthy();
    });

    expect(result.current.byPlantId.p1.latestLogAt).toBe("2026-06-15T10:00:00.000Z");
    expect(result.current.byPlantId.p1.hasRecentPhoto).toBe(true);
    expect(result.current.byPlantId.p2.latestLogAt).toBe("2026-06-10T10:00:00.000Z");
    expect(result.current.byPlantId.p2.hasRecentPhoto).toBe(false);
  });

  it("returns null latest log when no diary rows for that plant", async () => {
    mocks.diaryByPlant.set("p1", [
      diaryRow({ id: "a", plant_id: "p1" }),
    ]);
    const { result } = renderHook(
      () =>
        useTentPlantRosterActivity([
          { id: "p1", name: "Alpha" },
          { id: "p2", name: "Beta" },
        ]),
      { wrapper: wrap() },
    );
    await waitFor(() => {
      expect(result.current.byPlantId.p1).toBeDefined();
      expect(result.current.byPlantId.p2).toBeDefined();
    });
    expect(result.current.byPlantId.p2.latestLogAt).toBeNull();
    expect(result.current.byPlantId.p2.hasRecentPhoto).toBe(false);
  });

  it("includes a Harvest Watch v0 public state string per plant", async () => {
    mocks.diaryByPlant.set("p1", [diaryRow({ plant_id: "p1" })]);
    const { result } = renderHook(
      () =>
        useTentPlantRosterActivity([
          { id: "p1", name: "Alpha", stage: "flower" },
        ]),
      { wrapper: wrap() },
    );
    await waitFor(() => {
      expect(result.current.byPlantId.p1).toBeDefined();
    });
    const state = result.current.byPlantId.p1.harvestWatchPublicState;
    expect(typeof state === "string" || state === null).toBe(true);
    if (typeof state === "string") {
      expect([
        "not_enough_evidence",
        "too_early_to_call",
        "watch_window",
        "ready_for_manual_review",
        "past_expected_window",
        "unknown",
      ]).toContain(state);
    }
  });
});

describe("useTentPlantRosterActivity static safety", () => {
  const path = resolve(__dirname, "../hooks/useTentPlantRosterActivity.ts");
  const content = readFileSync(path, "utf8");

  it("never reads sensor_readings", () => {
    expect(content).not.toMatch(/sensor_readings/);
  });
  it("does not import AI/alerts/action-queue/device-control surfaces", () => {
    expect(content).not.toMatch(/ai-?doctor|aiCoach|model-?call/i);
    expect(content).not.toMatch(/from\s+["'][^"']*\/alerts?/);
    expect(content).not.toMatch(/actionQueue|action_queue/);
    expect(content).not.toMatch(/deviceControl|device_control/);
  });
  it("does not perform Supabase writes", () => {
    expect(content).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});
