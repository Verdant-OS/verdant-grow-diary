/**
 * DerivedVpdStatus presentational + view-model tests.
 *
 * Validates:
 *  - Renders derived VPD when temp + RH valid.
 *  - Renders "VPD unavailable" when missing/invalid.
 *  - Stage unknown never renders healthy/in-target language.
 *  - Stage-based status: in target / below / above.
 *  - Help copy mentions temperature + relative humidity.
 *  - Source/label is "Derived VPD" — never "Live".
 *  - JSX files do not duplicate the VPD target table.
 *  - Static safety scan of new files.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import DerivedVpdStatus from "@/components/DerivedVpdStatus";
import {
  buildDerivedVpdStatusViewModel,
  DERIVED_VPD_HELP_COPY,
} from "@/lib/derivedVpdStatusViewModel";

describe("buildDerivedVpdStatusViewModel", () => {
  it("returns available + numeric VPD for valid °F + RH", () => {
    const vm = buildDerivedVpdStatusViewModel({
      airTempF: 77, // 25°C
      humidityPct: 60,
      stage: "veg",
    });
    expect(vm.available).toBe(true);
    expect(vm.vpdKpa).not.toBeNull();
    expect(vm.classification).toBe("in_band");
    expect(vm.statusLabel).toBe("In target");
    expect(vm.vpdLabel).toBe("Derived VPD");
    expect(vm.vpdLabel).not.toMatch(/live/i);
  });

  it("returns unavailable when temp missing", () => {
    const vm = buildDerivedVpdStatusViewModel({
      airTempF: "",
      humidityPct: 55,
      stage: "veg",
    });
    expect(vm.available).toBe(false);
    expect(vm.vpdKpa).toBeNull();
    expect(vm.statusLabel).toBe("VPD unavailable");
    expect(vm.statusTone).toBe("unavailable");
  });

  it("returns unavailable when RH is invalid (NaN/out of range)", () => {
    const vm = buildDerivedVpdStatusViewModel({
      airTempF: 75,
      humidityPct: 150,
      stage: "veg",
    });
    expect(vm.available).toBe(false);
    expect(vm.statusLabel).toBe("VPD unavailable");
  });

  it("never marks stage-unknown as healthy/in-target", () => {
    const vm = buildDerivedVpdStatusViewModel({
      airTempF: 77,
      humidityPct: 60,
      stage: null,
    });
    expect(vm.classification).toBe("stage_unknown");
    expect(vm.statusLabel).not.toMatch(/in target|healthy/i);
    expect(vm.statusLabel.toLowerCase()).toContain("stage unknown");
  });

  it("classifies high VPD against stage band", () => {
    const vm = buildDerivedVpdStatusViewModel({
      airTempF: 90, // hot
      humidityPct: 30,
      stage: "seedling",
    });
    expect(vm.classification).toBe("high");
    expect(vm.statusLabel).toBe("Above target");
  });

  it("classifies low VPD against stage band", () => {
    const vm = buildDerivedVpdStatusViewModel({
      airTempF: 70,
      humidityPct: 90,
      stage: "flower",
    });
    expect(vm.classification).toBe("low");
    expect(vm.statusLabel).toBe("Below target");
  });

  it("help copy explains temp + RH", () => {
    expect(DERIVED_VPD_HELP_COPY).toMatch(/temperature/i);
    expect(DERIVED_VPD_HELP_COPY).toMatch(/humidity/i);
  });
});

describe("<DerivedVpdStatus />", () => {
  it("renders Derived VPD value when temp + RH valid", () => {
    render(<DerivedVpdStatus airTempF={77} humidityPct={60} stage="veg" />);
    expect(screen.getByTestId("derived-vpd-status")).toBeInTheDocument();
    expect(screen.getByTestId("derived-vpd-status-value")).toBeInTheDocument();
    expect(screen.getByTestId("derived-vpd-status")).toHaveTextContent(/Derived VPD/);
    expect(screen.getByTestId("derived-vpd-status")).not.toHaveTextContent(/Live/);
  });

  it("renders VPD unavailable when inputs missing", () => {
    render(<DerivedVpdStatus airTempF="" humidityPct="" stage="veg" />);
    expect(screen.getByTestId("derived-vpd-status-unavailable")).toBeInTheDocument();
    expect(screen.getByTestId("derived-vpd-status-status")).toHaveTextContent(
      /VPD unavailable/,
    );
  });

  it("stage unknown never renders healthy/in-target language", () => {
    render(<DerivedVpdStatus airTempF={77} humidityPct={60} />);
    const status = screen.getByTestId("derived-vpd-status-status");
    expect(status.textContent ?? "").not.toMatch(/in target|healthy/i);
    expect(status).toHaveTextContent(/Stage unknown/);
  });
});

/* ---------- static safety + no-duplicate-table guards ---------- */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("VPD UI safety + no JSX duplication", () => {
  const all = walk(SRC);

  it("no JSX/TSX file hardcodes VPD stage target band numbers", () => {
    const jsx = all.filter((f) => f.endsWith(".tsx"));
    // Sentinels from VPD_STAGE_TARGETS: seedling 0.4–0.8, veg 0.8–1.2, etc.
    // We only check the very specific seedling band tuple to avoid false
    // positives on unrelated numeric strings.
    const sentinel = /0\.4\s*[–-]\s*0\.8\s*kPa/;
    const offenders = jsx.filter((f) => sentinel.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("DerivedVpdStatus + view-model + manual card contain no forbidden runtime calls", () => {
    const files = [
      "src/lib/derivedVpdStatusViewModel.ts",
      "src/components/DerivedVpdStatus.tsx",
    ].map((p) => readFileSync(join(process.cwd(), p), "utf8"));

    for (const src of files) {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase\/client["']/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/\.from\(["']alerts["']\)/);
      // device-control sentinels
      expect(src).not.toMatch(/turn[_\s-]?(on|off)/i);
      expect(src).not.toMatch(/relay|actuator|dose_pump|dosing/i);
    }
  });
});
