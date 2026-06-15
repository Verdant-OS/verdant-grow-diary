import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";

import FeedingHistoryPanel from "@/components/FeedingHistoryPanel";
import {
  normalizeDiaryEntries,
  type NormalizedDiaryEntry,
} from "@/lib/diaryEntryRules";
import { buildFeedingHistory } from "@/lib/feedingHistoryRules";

function feeding(id: string, details: Record<string, unknown>) {
  return {
    id,
    grow_id: "g1",
    plant_id: "p1",
    tent_id: "t1",
    stage: "veg",
    entry_at: "2025-05-10T12:00:00.000Z",
    entry_type: "feeding",
    note: "",
    photo_url: null,
    details,
  };
}

const observationEntry = {
  id: "obs1",
  grow_id: "g1",
  plant_id: "p1",
  tent_id: "t1",
  stage: "veg",
  entry_at: "2025-05-10T12:00:00.000Z",
  entry_type: "observation",
  note: "leaves look fine",
  photo_url: null,
  details: {},
};

function normalize(raw: unknown[]): NormalizedDiaryEntry[] {
  return normalizeDiaryEntries({ rawEntries: raw });
}

describe("feedingHistoryRules — waterTempC extraction", () => {
  it("reads water_temp_c from extras and tags source as manual", () => {
    const [row] = buildFeedingHistory(
      normalize([feeding("f1", { ec: 1.8, water_temp_c: 22 })]),
    );
    expect(row.waterTempC).toBe(22);
    expect(row.sourceLabel).toBe("manual");
  });

  it("supports camelCase waterTempC variant", () => {
    const [row] = buildFeedingHistory(
      normalize([feeding("f2", { ec: 1.8, waterTempC: 19 })]),
    );
    expect(row.waterTempC).toBe(19);
  });

  it("returns null when extras has no water temp", () => {
    const [row] = buildFeedingHistory(
      normalize([feeding("f3", { ec: 1.8 })]),
    );
    expect(row.waterTempC).toBeNull();
  });
});

describe("FeedingHistoryPanel — EC @25°C preview rendering", () => {
  it("shows EC @25°C preview + 'Not stored' for safe feeding entry", () => {
    render(
      <FeedingHistoryPanel
        rawEntries={[feeding("f-safe", { ec: 1.8, water_temp_c: 28 })]}
      />,
    );
    const block = screen.getByTestId("feeding-history-ec-compensation-f-safe");
    expect(block).toHaveAttribute("data-tone", "ok");
    expect(within(block).getByText(/EC @25°C preview/)).toBeInTheDocument();
    expect(within(block).getByText(/mS\/cm/)).toBeInTheDocument();
    expect(within(block).getByText(/Not stored/)).toBeInTheDocument();
  });

  it("shows Fahrenheit-first water temp chip", () => {
    render(
      <FeedingHistoryPanel
        rawEntries={[feeding("f-temp", { ec: 1.8, water_temp_c: 20 })]}
      />,
    );
    expect(screen.getByText(/68°F \/ 20°C/)).toBeInTheDocument();
  });

  it("hides preview when EC is missing", () => {
    render(
      <FeedingHistoryPanel
        rawEntries={[feeding("f-no-ec", { water_temp_c: 22 })]}
      />,
    );
    expect(
      screen.queryByTestId("feeding-history-ec-compensation-f-no-ec"),
    ).toBeNull();
  });

  it("hides preview when water temperature is missing", () => {
    render(
      <FeedingHistoryPanel
        rawEntries={[feeding("f-no-temp", { ec: 1.8 })]}
      />,
    );
    expect(
      screen.queryByTestId("feeding-history-ec-compensation-f-no-temp"),
    ).toBeNull();
  });

  it("hides preview when EC is out of plausible range (rejected upstream by diary normalizer)", () => {
    // The diary normalizer drops ec > 10 before it ever reaches the preview,
    // so unit-mismatched historical rows simply produce no preview block
    // rather than a "Needs unit review" badge in the timeline.
    render(
      <FeedingHistoryPanel
        rawEntries={[feeding("f-bad-ec", { ec: 1800, water_temp_c: 22 })]}
      />,
    );
    expect(
      screen.queryByTestId("feeding-history-ec-compensation-f-bad-ec"),
    ).toBeNull();
  });

  it("flags suspicious water temperature as Needs unit review", () => {
    render(
      <FeedingHistoryPanel
        rawEntries={[feeding("f-bad-temp", { ec: 1.8, water_temp_c: 78 })]}
      />,
    );
    const block = screen.getByTestId(
      "feeding-history-ec-compensation-f-bad-temp",
    );
    expect(block).toHaveAttribute("data-tone", "review");
  });

  it("does not render preview for non-feeding entries", () => {
    render(<FeedingHistoryPanel rawEntries={[observationEntry]} />);
    expect(
      screen.queryByText(/EC @25°C preview/),
    ).toBeNull();
  });

  it("never leaks raw_payload, service_role, Bearer tokens, or private keys", () => {
    render(
      <FeedingHistoryPanel
        rawEntries={[
          feeding("f-leak", {
            ec: 1.8,
            water_temp_c: 24,
            extras: {
              raw_payload: { secret: "sk_live_xxx" },
              service_role: "abc",
              bearer: "Bearer xyz",
              private_key: "-----BEGIN PRIVATE KEY-----",
            },
          }),
        ]}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/Bearer\s+xyz/);
    expect(text).not.toMatch(/sk_live_/);
    expect(text).not.toMatch(/PRIVATE KEY/);
  });
});

describe("feeding history EC preview — static safety", () => {
  it("module imports no Supabase / network / cron surfaces", () => {
    const ruleSrc = readFileSync(
      resolve(process.cwd(), "src/lib/feedingHistoryRules.ts"),
      "utf8",
    );
    const panelSrc = readFileSync(
      resolve(process.cwd(), "src/components/FeedingHistoryPanel.tsx"),
      "utf8",
    );
    const tempSrc = readFileSync(
      resolve(process.cwd(), "src/lib/temperatureDisplay.ts"),
      "utf8",
    );
    for (const src of [ruleSrc, panelSrc, tempSrc]) {
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/supabase-js/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/\b(pg_cron|setInterval|setTimeout)\b/);
      expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    }
  });
});
