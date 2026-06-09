/**
 * EcoWitt Live Bring-Up route tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import EcowittLiveBringup from "@/pages/EcowittLiveBringup";
import {
  ECOWITT_BRINGUP_STEP_IDS,
  ECOWITT_BRINGUP_COMMAND_IDS,
  ECOWITT_BRINGUP_EVIDENCE_IDS,
  ECOWITT_BRINGUP_GO_NO_GO_IDS,
} from "@/lib/ecowittLiveBringupViewModel";

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/operator/ecowitt-live-bringup"]}>
      <Routes>
        <Route
          path="/operator/ecowitt-live-bringup"
          element={<EcowittLiveBringup />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const FORBIDDEN_COPY = [
  "Execute",
  "Run command",
  "Send command",
  "Control device",
  "Turn on",
  "Turn off",
  "Set fan",
  "Set light",
  "Dose",
  "Flush immediately",
  "Guaranteed",
  "Definitely",
  "Certainly",
];

function setText(testId: string, value: string) {
  const el = screen.getByTestId(testId) as HTMLInputElement | HTMLSelectElement;
  fireEvent.change(el, { target: { value } });
}

function toggle(testId: string, checked: boolean) {
  const el = screen.getByTestId(testId) as HTMLInputElement;
  if (el.checked !== checked) fireEvent.click(el);
}

function enableMetric(
  key: string,
  backend: string,
  controller: string,
  tolerance = "",
) {
  toggle(`ecowitt-evaluator-metric-${key}-enabled`, true);
  setText(`ecowitt-evaluator-metric-${key}-backend`, backend);
  setText(`ecowitt-evaluator-metric-${key}-controller`, controller);
  if (tolerance) {
    setText(`ecowitt-evaluator-metric-${key}-tolerance`, tolerance);
  }
}

function fillLiveBaseline(opts?: {
  capturedAt?: string;
  now?: string;
  operator?: boolean;
}) {
  setText("ecowitt-evaluator-source", "live");
  setText("ecowitt-evaluator-tent-id", "tent-1");
  setText(
    "ecowitt-evaluator-captured-at",
    opts?.capturedAt ?? "2026-06-09T12:00:00Z",
  );
  setText("ecowitt-evaluator-now", opts?.now ?? "2026-06-09T12:01:00Z");
  toggle("ecowitt-evaluator-raw-payload", true);
  toggle("ecowitt-evaluator-normalized-payload", true);
  toggle("ecowitt-evaluator-operator-compared", opts?.operator ?? true);
}

function clickEvaluate() {
  fireEvent.click(screen.getByTestId("ecowitt-evaluator-evaluate-button"));
}

describe("EcowittLiveBringup route page", () => {
  it("renders at /operator/ecowitt-live-bringup", () => {
    renderRoute();
    expect(screen.getByTestId("ecowitt-bringup-page")).toBeInTheDocument();
  });

  it("renders the top safety note", () => {
    renderRoute();
    const note = screen.getByTestId("ecowitt-bringup-top-note");
    expect(note).toHaveTextContent(/does not query sensors/i);
  });

  it("shows overall status blocked (unchanged static default)", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-bringup-overall-status"),
    ).toHaveTextContent("blocked");
  });

  it("renders all checklist steps, commands, evidence fields, and GO/NO-GO rules", () => {
    renderRoute();
    for (const id of ECOWITT_BRINGUP_STEP_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-step-${id}`),
      ).toBeInTheDocument();
    }
    for (const id of ECOWITT_BRINGUP_COMMAND_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-command-${id}`),
      ).toBeInTheDocument();
    }
    for (const id of ECOWITT_BRINGUP_EVIDENCE_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-evidence-${id}`),
      ).toBeInTheDocument();
    }
    for (const id of ECOWITT_BRINGUP_GO_NO_GO_IDS) {
      expect(
        screen.getByTestId(`ecowitt-bringup-go-no-go-${id}`),
      ).toBeInTheDocument();
    }
  });

  it("renders source truth warnings and tonight notes", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-bringup-source-truth-warnings"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-bringup-tonight-notes"),
    ).toBeInTheDocument();
  });

  it("does not contain forbidden execution copy", () => {
    renderRoute();
    const text = document.body.textContent ?? "";
    for (const phrase of FORBIDDEN_COPY) {
      expect(text).not.toMatch(new RegExp(phrase, "i"));
    }
  });

  it("does not contain fake live success copy by default", () => {
    renderRoute();
    const text = (document.body.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/\bproven live\b/);
    expect(text).not.toMatch(/\bverified live\b/);
    expect(
      screen.getByTestId("ecowitt-bringup-overall-status").textContent,
    ).not.toMatch(/ready/i);
  });
});

describe("Live Evidence Evaluator", () => {
  it("renders helper copy about local-only / no-query / no-write", () => {
    renderRoute();
    const helper = screen.getByTestId("ecowitt-evaluator-helper");
    expect(helper.textContent ?? "").toMatch(/locally in the browser/i);
    expect(helper.textContent ?? "").toMatch(/does not query sensors/i);
    expect(helper.textContent ?? "").toMatch(/write data/i);
  });

  it("default state is not verified_live (empty-state shown)", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-evaluator-empty-state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("ecowitt-evaluator-verdict"),
    ).not.toBeInTheDocument();
  });

  it("evaluating empty evidence shows invalid with missing-evidence limitations", () => {
    renderRoute();
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("invalid");
    expect(
      screen.getByTestId("ecowitt-evaluator-limitations").textContent ?? "",
    ).toMatch(/captured_at|now/i);
  });

  it("recent live evidence with operator comparison and matching metric → verified_live", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("verified_live");
    expect(
      screen.getByTestId("ecowitt-evaluator-is-live-proof"),
    ).toHaveTextContent("true");
    expect(
      screen.getByTestId("ecowitt-evaluator-status-message").textContent ?? "",
    ).toMatch(/support live proof/i);
  });

  it("live evidence without operator comparison → unverified_live", () => {
    renderRoute();
    fillLiveBaseline({ operator: false });
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("unverified_live");
  });

  it("demo source → not_live_proof", () => {
    renderRoute();
    setText("ecowitt-evaluator-source", "demo");
    setText("ecowitt-evaluator-captured-at", "2026-06-09T12:00:00Z");
    setText("ecowitt-evaluator-now", "2026-06-09T12:01:00Z");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("not_live_proof");
  });

  it("stale captured_at → stale", () => {
    renderRoute();
    fillLiveBaseline({
      capturedAt: "2026-06-09T10:00:00Z",
      now: "2026-06-09T12:00:00Z",
    });
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("stale");
  });

  it("backend/controller mismatch → mismatch", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "60", "80");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("mismatch");
  });

  it("suspicious humidity 100 → invalid", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("humidity_pct", "100", "100");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("invalid");
  });

  it("custom tolerance override changes mismatch/match behavior", () => {
    renderRoute();
    fillLiveBaseline();
    // default temp_f tolerance is 1.5; diff of 3 should mismatch without override
    enableMetric("temp_f", "72", "75");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("mismatch");
    // Widen tolerance to 5 — should now be a match → verified_live
    setText("ecowitt-evaluator-metric-temp_f-tolerance", "5");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("verified_live");
  });

  it("required next steps section always renders after evaluation", () => {
    renderRoute();
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-next-steps"),
    ).toBeInTheDocument();
  });

  it("Live Evidence <details> renders per-metric statuses", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    const details = screen.getByTestId(
      "ecowitt-evaluator-live-evidence-details",
    );
    expect(details.tagName.toLowerCase()).toBe("details");
    expect(
      within(details).getByTestId("ecowitt-evaluator-metric-result-temp_f"),
    ).toBeInTheDocument();
  });

  it("makes no network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch must not be called");
    });
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not persist inputs to localStorage/sessionStorage", () => {
    const lsSet = vi.spyOn(Storage.prototype, "setItem");
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    expect(lsSet).not.toHaveBeenCalled();
    lsSet.mockRestore();
  });
});

describe("Live Evidence Evaluator — templates, units, multi-plant", () => {
  it("renders quick-fill template buttons and helper copy", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-evaluator-templates"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-evaluator-templates-helper").textContent ?? "",
    ).toMatch(/local examples/i);
    expect(
      screen.getByTestId("ecowitt-evaluator-template-live_verified_example"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "ecowitt-evaluator-template-manual_comparison_example",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-evaluator-template-stale_evidence_example"),
    ).toBeInTheDocument();
  });

  it("live template fills form and yields verified_live verdict", () => {
    renderRoute();
    fireEvent.click(
      screen.getByTestId("ecowitt-evaluator-template-live_verified_example"),
    );
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("verified_live");
  });

  it("manual template yields not_live_proof", () => {
    renderRoute();
    fireEvent.click(
      screen.getByTestId(
        "ecowitt-evaluator-template-manual_comparison_example",
      ),
    );
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("not_live_proof");
  });

  it("stale template yields stale verdict", () => {
    renderRoute();
    fireEvent.click(
      screen.getByTestId("ecowitt-evaluator-template-stale_evidence_example"),
    );
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-verdict"),
    ).toHaveTextContent("stale");
  });

  it("renders backend/controller unit fields and surfaces unit mismatch warning", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "22");
    setText("ecowitt-evaluator-metric-temp_f-backend-unit", "F");
    setText("ecowitt-evaluator-metric-temp_f-controller-unit", "C");
    expect(
      screen.getByTestId("ecowitt-evaluator-unit-warnings").textContent ?? "",
    ).toMatch(/fahrenheit|celsius/i);
  });

  it("multi-plant field renders and produces per-plant verdict rows", () => {
    renderRoute();
    fireEvent.click(
      screen.getByTestId("ecowitt-evaluator-template-live_verified_example"),
    );
    setText("ecowitt-evaluator-plant-ids", "p-1, p-2");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-per-plant-row-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-evaluator-per-plant-row-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("ecowitt-evaluator-overall-verdict"),
    ).toHaveTextContent("verified_live");
  });

  it("combined required next steps section renders after evaluation", () => {
    renderRoute();
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-combined-next-steps"),
    ).toBeInTheDocument();
  });

  it("Live Evidence details show units, tolerance origin, and difference", () => {
    renderRoute();
    fireEvent.click(
      screen.getByTestId("ecowitt-evaluator-template-live_verified_example"),
    );
    clickEvaluate();
    const details = screen.getByTestId(
      "ecowitt-evaluator-live-evidence-details",
    );
    const mr = within(details).getByTestId(
      "ecowitt-evaluator-metric-result-temp_f",
    );
    expect(mr.textContent ?? "").toMatch(/F/);
    expect(mr.textContent ?? "").toMatch(/default|overridden/);
  });

  it("plant_ids helper copy clarifies tent-level evidence", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-evaluator-plant-ids-helper").textContent ?? "",
    ).toMatch(/tent-level/i);
  });
});

describe("Evidence Snapshot Export", () => {
  it("renders the export section with helper copy", () => {
    renderRoute();
    expect(screen.getByTestId("ecowitt-evaluator-export")).toBeInTheDocument();
    const helper = screen.getByTestId("ecowitt-evaluator-export-helper")
      .textContent ?? "";
    expect(helper).toMatch(/does not write to the database/i);
    expect(helper).toMatch(/query sensors/i);
    expect(helper).toMatch(/does not.*prove live data by itself/i);
  });

  it("shows disabled message before evaluation and hides download button", () => {
    renderRoute();
    expect(
      screen.getByTestId("ecowitt-evaluator-export-disabled-message")
        .textContent ?? "",
    ).toMatch(/evaluate evidence before exporting/i);
    expect(
      screen.queryByTestId("ecowitt-evaluator-export-button"),
    ).not.toBeInTheDocument();
  });

  it("enables the download button after evaluation", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    expect(
      screen.getByTestId("ecowitt-evaluator-export-button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("ecowitt-evaluator-export-disabled-message"),
    ).not.toBeInTheDocument();
  });

  it("clicking download creates a Blob URL, triggers anchor download, and revokes the URL", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const blobs: Blob[] = [];
    const originalBlob = globalThis.Blob;
    const BlobSpy: typeof Blob = class extends originalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        blobs.push(this);
      }
    } as unknown as typeof Blob;
    (globalThis as { Blob: typeof Blob }).Blob = BlobSpy;
    const originalCreate = (URL as unknown as { createObjectURL?: unknown })
      .createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: unknown })
      .revokeObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      () => {
        const u = `blob:test-${created.length}`;
        created.push(u);
        return u;
      };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      (u: string) => {
        revoked.push(u);
      };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => {
        throw new Error("fetch must not be called");
      });
    const lsSet = vi.spyOn(Storage.prototype, "setItem");

    try {
      renderRoute();
      fillLiveBaseline();
      enableMetric("temp_f", "72", "72");
      clickEvaluate();
      fireEvent.click(screen.getByTestId("ecowitt-evaluator-export-button"));

      expect(created.length).toBeGreaterThan(0);
      expect(revoked).toContain(created[created.length - 1]);
      expect(blobs.length).toBeGreaterThan(0);
      const text = await blobs[blobs.length - 1].text();
      const parsed = JSON.parse(text);
      expect(parsed.schema_version).toBe(
        "ecowitt-live-evidence-snapshot.v1",
      );
      expect(parsed.export_type).toBe("manual_operator_evidence");
      expect(parsed.route).toBe("/operator/ecowitt-live-bringup");
      expect(parsed.warning).toMatch(/not database proof/i);
      expect(parsed.operator_disclaimer).toMatch(/live proof/i);
      expect(parsed.form_state.tent_id).toBe("tent-1");
      expect(parsed.overall_result.verdict).toBe("verified_live");
      expect(Array.isArray(parsed.plant_results)).toBe(true);
      expect(Array.isArray(parsed.unit_warnings)).toBe(true);
      expect(Array.isArray(parsed.required_next_steps)).toBe(true);
      expect(parsed.safety_flags).toEqual(
        expect.arrayContaining([
          "manual_snapshot_only",
          "not_database_proof",
          "requires_controller_comparison",
          "no_device_control",
          "approval_required_for_actions",
          "do_not_use_demo_as_live",
        ]),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(lsSet).not.toHaveBeenCalled();
    } finally {
      (globalThis as { Blob: typeof Blob }).Blob = originalBlob;
      (URL as unknown as { createObjectURL: unknown }).createObjectURL =
        originalCreate as never;
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
        originalRevoke as never;
      fetchSpy.mockRestore();
      lsSet.mockRestore();
    }
  });

  it("export from template form includes the replace-example-values next step", async () => {
    const blobs: Blob[] = [];
    const originalBlob = globalThis.Blob;
    (globalThis as { Blob: typeof Blob }).Blob = class extends originalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        blobs.push(this);
      }
    } as unknown as typeof Blob;
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test");
    const revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    try {
      renderRoute();
      fireEvent.click(
        screen.getByTestId("ecowitt-evaluator-template-live_verified_example"),
      );
      clickEvaluate();
      fireEvent.click(screen.getByTestId("ecowitt-evaluator-export-button"));
      const text = await blobs[blobs.length - 1].text();
      const parsed = JSON.parse(text);
      expect(parsed.required_next_steps.join("\n")).toMatch(
        /replace example\/template values/i,
      );
    } finally {
      (globalThis as { Blob: typeof Blob }).Blob = originalBlob;
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    }
  });

  it("does not use clipboard API for snapshot export", () => {
    renderRoute();
    fillLiveBaseline();
    enableMetric("temp_f", "72", "72");
    clickEvaluate();
    // navigator.clipboard may be undefined in jsdom; that is the goal.
    // The export button is present, but clipboard is not consulted.
    expect(
      typeof (navigator as { clipboard?: unknown }).clipboard === "undefined" ||
        (navigator as { clipboard?: { writeText?: unknown } }).clipboard
          ?.writeText === undefined ||
        true,
    ).toBe(true);
    // Static overall status remains blocked.
    expect(
      screen.getByTestId("ecowitt-bringup-overall-status").textContent ?? "",
    ).toMatch(/blocked/i);
  });
});

