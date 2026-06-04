/**
 * Manual sensor PPFD entry — UI + rules wiring.
 *
 * Locks: PPFD is an optional field in the Manual Sensor Reading form,
 * blank means unknown (not zero), valid values flow into the save
 * payload as the canonical `ppfd` metric, captured_at is preserved,
 * source stays manual, no client user_id is attached, and helper copy
 * warns growers not to estimate PPFD from watts/light percentage.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import {
  validateManualEntry,
  buildManualReadingPayloads,
} from "@/lib/sensorReadingManualEntryRules";

const insertedRows: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: async (row: unknown) => {
        insertedRows.push(row);
        return { error: null };
      },
    }),
  },
}));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ManualSensorReadingCard
        tents={[{ id: "11111111-1111-1111-1111-111111111111", name: "Tent A" }]}
      />
    </QueryClientProvider>,
  );
}

describe("ManualSensorReadingCard — PPFD field", () => {
  it("renders an optional PPFD field with label and µmol/m²/s unit", () => {
    renderCard();
    const light = screen.getByTestId("manual-reading-section-light");
    expect(light).toBeTruthy();
    const input = screen.getByLabelText(/PPFD/i) as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.required).toBe(false);
    expect(light.textContent ?? "").toContain("µmol/m²/s");
  });

  it("shows helper copy warning not to estimate from watts/light percentage", () => {
    renderCard();
    const hint = screen.getByTestId("manual-reading-ppfd-hint");
    const text = hint.textContent ?? "";
    expect(text).toMatch(/PAR|quantum meter/i);
    expect(text.toLowerCase()).toMatch(/do not estimate/);
    expect(text.toLowerCase()).toMatch(/light percentage/);
    expect(text.toLowerCase()).toMatch(/watt/);
  });
});

describe("validateManualEntry — PPFD", () => {
  it("treats blank PPFD as unknown (not zero), does not add metric", () => {
    const v = validateManualEntry({ humidityPct: "55", ppfd: "" });
    expect(v.ok).toBe(true);
    expect(v.metrics.find((m) => m.metric === "ppfd")).toBeUndefined();
  });

  it("accepts a valid PPFD reading and includes it as a metric", () => {
    const v = validateManualEntry({ ppfd: "650" });
    expect(v.ok).toBe(true);
    const m = v.metrics.find((x) => x.metric === "ppfd");
    expect(m?.value).toBe(650);
  });

  it("rejects negative PPFD", () => {
    const v = validateManualEntry({ ppfd: "-10" });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/PPFD/);
  });

  it("rejects implausibly high PPFD (>2500)", () => {
    const v = validateManualEntry({ ppfd: "9999" });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/PPFD/);
  });

  it("ignores non-numeric / NaN PPFD as unknown, not zero", () => {
    const v = validateManualEntry({ humidityPct: "55", ppfd: "abc" });
    expect(v.ok).toBe(true);
    expect(v.metrics.find((m) => m.metric === "ppfd")).toBeUndefined();
  });
});

describe("buildManualReadingPayloads — PPFD save shape", () => {
  it("emits a manual ppfd row with captured ts and no user_id", () => {
    const v = validateManualEntry({ ppfd: "420" });
    const ts = "2026-06-04T12:00:00.000Z";
    const rows = buildManualReadingPayloads({
      tentId: "11111111-1111-1111-1111-111111111111",
      metrics: v.metrics,
      ts,
    });
    const ppfd = rows.find((r) => r.metric === "ppfd");
    expect(ppfd).toBeTruthy();
    expect(ppfd?.value).toBe(420);
    expect(ppfd?.source).toBe("manual");
    expect(ppfd?.ts).toBe(ts);
    expect((ppfd as Record<string, unknown>).user_id).toBeUndefined();
  });
});

describe("ManualSensorReadingCard — PPFD save roundtrip", () => {
  it("includes PPFD in the saved payload, manual source, preserves ts", async () => {
    insertedRows.length = 0;
    renderCard();
    const ppfd = screen.getByLabelText(/PPFD/i) as HTMLInputElement;
    fireEvent.change(ppfd, { target: { value: "780" } });
    const save = screen.getByTestId("manual-reading-save") as HTMLButtonElement;
    fireEvent.click(save);
    // Poll briefly for the async insert to flush.
    for (let i = 0; i < 25 && insertedRows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(insertedRows.length).toBeGreaterThan(0);
    const ppfdRow = insertedRows.find(
      (r) => (r as Record<string, unknown>).metric === "ppfd",
    ) as Record<string, unknown> | undefined;
    expect(ppfdRow).toBeTruthy();
    expect(ppfdRow?.value).toBe(780);
    expect(ppfdRow?.source).toBe("manual");
    expect(typeof ppfdRow?.ts).toBe("string");
    expect(ppfdRow?.user_id).toBeUndefined();
  });
});

describe("static safety: manual PPFD wiring", () => {
  const card = readFileSync(
    resolve(process.cwd(), "src/components/ManualSensorReadingCard.tsx"),
    "utf8",
  );
  const rules = readFileSync(
    resolve(process.cwd(), "src/lib/sensorReadingManualEntryRules.ts"),
    "utf8",
  );
  const forbidden = [
    "service_role",
    "device_command",
    "actuator",
    "autopilot",
    "_executed",
  ];
  for (const term of forbidden) {
    it(`card does not reference \`${term}\``, () => {
      expect(card).not.toContain(term);
    });
    it(`rules do not reference \`${term}\``, () => {
      expect(rules).not.toContain(term);
    });
  }
  it("does not estimate PPFD from lux/watts/percentage in the rules layer", () => {
    expect(rules.toLowerCase()).not.toMatch(/lux|wattage|brightness/);
  });
  it("does not inline a PPFD validation table inside the JSX component", () => {
    // PPFD bounds must come from ppfdRules, not be re-declared in JSX.
    expect(card).not.toMatch(/PPFD_MAX\s*=/);
    expect(card).not.toMatch(/2500/);
  });
});
