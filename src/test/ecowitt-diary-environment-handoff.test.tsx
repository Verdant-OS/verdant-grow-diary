import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

import { EcowittIngestValidationPanel } from "@/components/EcowittIngestValidationPanel";
import {
  buildEcowittIngestValidationViewModel,
  type EcowittIngestValidationInput,
} from "@/lib/ecowittIngestValidationViewModel";
import {
  buildAlreadyLoggedEventInfo,
  buildDiaryEnvironmentCheckDraft,
  DIARY_ENVIRONMENT_CHECK_TITLE,
  environmentCheckTimelineHref,
} from "@/lib/ecowittDiaryEnvironmentCheckRules";
import {
  buildLatestEvidenceSnapshot,
  serializeEvidenceForClipboard,
  ECOWITT_EVIDENCE_LABEL,
} from "@/lib/ecowittValidationEvidenceRules";
import { buildEcowittValidationExport, serializeExport } from "@/lib/ecowittValidationExportRules";

const NOW = new Date("2026-06-07T12:00:00Z");
const TENT = "11111111-2222-3333-4444-555555555555";

function acceptedInput(
  extra?: Partial<EcowittIngestValidationInput>,
): EcowittIngestValidationInput {
  return {
    tentId: TENT,
    now: NOW,
    rows: [
      {
        id: "r1",
        source: "ecowitt",
        captured_at: "2026-06-07T11:58:00Z",
        ts: "2026-06-07T11:58:00Z",
        metric: "temp_f",
        raw_payload: {
          transport: "mqtt_local_test",
          test_sender: true,
          invalid_test: false,
          // Secret-y values that must be redacted from any export/copy.
          token: "SECRET-TOKEN-xxx",
          bridge_token: "BRIDGE-yyy",
          authorization: "Bearer zzz",
          service_role: "srv-key",
          signature: "sig-abc",
          api_key: "ak-123",
          user_id: "uuid-of-user",
          id: "internal-row-id-12345",
          metrics: {
            temp_f: 78.6,
            humidity_pct: 56.2,
            vpd_kpa: 1.46,
            co2_ppm: 966,
            soil_moisture_pct: 45,
          },
          metadata: {
            transport: "mqtt_local_test",
            test_sender: true,
            invalid_test: false,
          },
        },
      },
    ],
    ...extra,
  };
}

function evidenceSnapshot(rawPayload: unknown) {
  return buildLatestEvidenceSnapshot({
    hasEvidence: true,
    status: "accepted",
    statusMessage: "Accepted by ingest webhook.",
    sourceLabel: "ecowitt",
    tentScopedLabel: "1111…(len=36)",
    capturedAtLabel: "2026-06-07T11:58:00Z",
    isTestSender: true,
    invalidTest: false,
    stale: false,
    metricRows: [],
    rawPayload,
    derivedReadingWarnings: [],
  })!;
}

describe("ecowitt diary environment check rules", () => {
  it("links only to a real Timeline entry anchor when the saved event id is known", () => {
    expect(environmentCheckTimelineHref("2026-06-07T11:58:00Z", "grow-123", "grow-event-456")).toBe(
      "/timeline?growId=grow-123#timeline-entry-grow-event-456",
    );
    expect(environmentCheckTimelineHref("2026-06-07T11:58:00Z", "grow-123")).toBe(
      "/timeline?growId=grow-123",
    );
    expect(
      buildAlreadyLoggedEventInfo("2026-06-07T11:58:00Z", "grow-123", "grow-event-456"),
    ).toMatchObject({
      capturedAt: "2026-06-07T11:58:00Z",
      href: "/timeline?growId=grow-123#timeline-entry-grow-event-456",
    });
  });

  it("builds an eligible draft from accepted EcoWitt evidence", () => {
    const vm = buildEcowittIngestValidationViewModel(acceptedInput());
    const draft = buildDiaryEnvironmentCheckDraft({
      tentId: TENT,
      capturedAt: vm.latestCapturedAt,
      status: vm.status,
      isTestSender: vm.isTestSender,
      invalidTest: vm.invalidTest,
      stale: vm.stale,
      sourceLabel: vm.sourceLabel,
      metricRows: vm.metricRows,
    });
    expect(draft.eligible).toBe(true);
    expect(draft.title).toBe(DIARY_ENVIRONMENT_CHECK_TITLE);
    expect(draft.eventType).toBe("environment_check");
    expect(draft.fallbackEventType).toBe("environment");
    expect(draft.occurredAt).toBe("2026-06-07T11:58:00Z");
    expect(draft.humidityPct).toBeCloseTo(56.2);
    expect(draft.vpdKpa).toBeCloseTo(1.46);
    // F→C conversion of 78.6F ≈ 25.89C
    expect(draft.temperatureC).toBeCloseTo(25.89, 1);
    expect(draft.acceptedMetricCount).toBeGreaterThan(0);
    expect(draft.noteBody).toContain("local EcoWitt validation");
    expect(draft.noteBody).toContain("temp_f");
    expect(draft.noteBody).toContain("humidity_pct");
    expect(draft.rpcPayload.p_target_type).toBe("tent");
    expect(draft.rpcPayload.p_target_id).toBe(TENT);
    expect(draft.rpcPayload.p_action).toBe("note");
  });

  it("draft excludes secret tokens / authorization / service_role / internal ids", () => {
    const vm = buildEcowittIngestValidationViewModel(acceptedInput());
    const draft = buildDiaryEnvironmentCheckDraft({
      tentId: TENT,
      capturedAt: vm.latestCapturedAt,
      status: vm.status,
      isTestSender: vm.isTestSender,
      invalidTest: vm.invalidTest,
      stale: vm.stale,
      sourceLabel: vm.sourceLabel,
      metricRows: vm.metricRows,
    });
    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain("SECRET-TOKEN");
    expect(serialized).not.toContain("BRIDGE-yyy");
    expect(serialized).not.toContain("Bearer zzz");
    expect(serialized).not.toContain("srv-key");
    expect(serialized).not.toContain("sig-abc");
    expect(serialized).not.toContain("ak-123");
    expect(serialized).not.toContain("uuid-of-user");
    expect(serialized).not.toContain("internal-row-id-12345");
  });

  it("ineligible when status not accepted", () => {
    const vm = buildEcowittIngestValidationViewModel({
      ...acceptedInput(),
      rows: [
        {
          ...acceptedInput().rows![0],
          raw_payload: {
            ...(acceptedInput().rows![0].raw_payload as object),
            invalid_test: true,
            metadata: { test_sender: true, invalid_test: true },
          },
        },
      ],
    });
    const draft = buildDiaryEnvironmentCheckDraft({
      tentId: TENT,
      capturedAt: vm.latestCapturedAt,
      status: vm.status,
      isTestSender: vm.isTestSender,
      invalidTest: vm.invalidTest,
      stale: vm.stale,
      sourceLabel: vm.sourceLabel,
      metricRows: vm.metricRows,
    });
    expect(draft.eligible).toBe(false);
    expect(draft.reason).toBe("not_accepted");
  });
});

describe("ecowitt view model — derived/raw warning + alreadyLogged", () => {
  it("emits derived/raw-boundary warning when vpd_kpa is inside snapshot.readings", () => {
    const vm = buildEcowittIngestValidationViewModel({
      ...acceptedInput(),
      rows: [
        {
          ...acceptedInput().rows![0],
          raw_payload: {
            ...(acceptedInput().rows![0].raw_payload as object),
            snapshot: {
              readings: [
                { metric: "temp_f", value: 78.6 },
                { metric: "vpd_kpa", value: 1.46 }, // OFFENDING
              ],
            },
          },
        },
      ],
    });
    expect(vm.derivedReadingWarnings.length).toBe(1);
    expect(vm.derivedReadingWarnings[0]).toMatch(/derived/i);
    expect(vm.derivedReadingWarnings[0]).toMatch(/snapshot\.readings/);
  });

  it("does not warn when derived VPD is only in metrics.vpd_kpa", () => {
    const vm = buildEcowittIngestValidationViewModel(acceptedInput());
    expect(vm.derivedReadingWarnings.length).toBe(0);
  });

  it("alreadyLogged when captured_at is in loggedCapturedAts set", () => {
    const vm = buildEcowittIngestValidationViewModel({
      ...acceptedInput(),
      loggedCapturedAts: ["2026-06-07T11:58:00Z"],
    });
    expect(vm.alreadyLogged).toBe(true);
    expect(vm.eligibleForDiaryLog).toBe(false);
    expect(vm.ineligibleReason).toBe("already_logged");
  });
});

describe("EcowittIngestValidationPanel — diary handoff", () => {
  it("renders Log Environment Check button only when evidence + handler provided", () => {
    const onLog = vi.fn();
    const { rerender } = render(
      <EcowittIngestValidationPanel
        input={{ rows: [], tentId: TENT, now: NOW }}
        onLogEnvironmentCheck={onLog}
      />,
    );
    expect(screen.queryByTestId("log-environment-check-button")).toBeNull();

    rerender(
      <EcowittIngestValidationPanel input={acceptedInput()} onLogEnvironmentCheck={onLog} />,
    );
    const btn = screen.getByTestId("log-environment-check-button");
    expect(btn.getAttribute("data-eligible")).toBe("true");
    expect(btn.getAttribute("data-already-logged")).toBe("false");
  });

  it("clicking Log Environment Check invokes handler with draft built from latest evidence", async () => {
    const onLog = vi.fn();
    render(<EcowittIngestValidationPanel input={acceptedInput()} onLogEnvironmentCheck={onLog} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("log-environment-check-button"));
    });
    expect(onLog).toHaveBeenCalledTimes(1);
    const draft = onLog.mock.calls[0][0];
    expect(draft.eligible).toBe(true);
    expect(draft.occurredAt).toBe("2026-06-07T11:58:00Z");
    expect(draft.rpcPayload.p_target_id).toBe(TENT);
  });

  it("clicking twice with alreadyLogged shows Already logged state and does not call handler again", async () => {
    const onLog = vi.fn();
    const { rerender } = render(
      <EcowittIngestValidationPanel input={acceptedInput()} onLogEnvironmentCheck={onLog} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("log-environment-check-button"));
    });
    expect(onLog).toHaveBeenCalledTimes(1);

    rerender(
      <EcowittIngestValidationPanel
        input={acceptedInput({
          loggedCapturedAts: ["2026-06-07T11:58:00Z"],
        })}
        onLogEnvironmentCheck={onLog}
      />,
    );
    const btn = screen.getByTestId("log-environment-check-button");
    expect(btn.textContent).toMatch(/Already logged/);
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it("renders explicit derived/raw-boundary warning in UI", () => {
    render(
      <EcowittIngestValidationPanel
        input={{
          ...acceptedInput(),
          rows: [
            {
              ...acceptedInput().rows![0],
              raw_payload: {
                ...(acceptedInput().rows![0].raw_payload as object),
                snapshot: {
                  readings: [{ metric: "vpd_kpa", value: 1.46 }],
                },
              },
            },
          ],
        }}
      />,
    );
    const warn = screen.getByTestId("validation-derived-warnings");
    expect(warn.textContent).toMatch(/derived/i);
    expect(warn.textContent).toMatch(/snapshot\.readings/);
  });

  it("never renders a Live label for test-sender evidence", () => {
    render(<EcowittIngestValidationPanel input={acceptedInput()} />);
    expect(screen.queryByText(/^Live$/i)).toBeNull();
  });
});

describe("EcowittIngestValidationPanel — copy + export", () => {
  let writeText: ReturnType<typeof vi.fn>;
  let originalClipboard: PropertyDescriptor | undefined;
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    }
    if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("Copy latest evidence opens preview modal, then writes redacted JSON to clipboard on confirm", async () => {
    render(<EcowittIngestValidationPanel input={acceptedInput()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-latest-evidence-button"));
    });
    // Preview modal renders and never shows secrets
    const dialog = screen.getByTestId("copy-preview-dialog");
    expect(dialog.textContent).toContain("Local EcoWitt validation evidence");
    expect(dialog.textContent).not.toContain("SECRET-TOKEN");
    expect(dialog.textContent).not.toContain("Bearer zzz");
    expect(dialog.textContent).not.toContain("srv-key");
    expect(dialog.textContent).not.toContain("ak-123");
    expect(dialog.textContent).not.toContain("uuid-of-user");
    expect(dialog.textContent).not.toContain("internal-row-id-12345");
    // Confirm
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-confirm-button"));
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain(ECOWITT_EVIDENCE_LABEL);
    expect(text).not.toContain("SECRET-TOKEN");
    expect(text).not.toContain("Bearer zzz");
    expect(text).not.toContain("srv-key");
    expect(text).not.toContain("sig-abc");
    expect(text).not.toContain("ak-123");
    expect(text).not.toContain("uuid-of-user");
    expect(text).not.toContain("internal-row-id-12345");
  });

  it("Copy cancel button closes modal without writing to clipboard", async () => {
    render(<EcowittIngestValidationPanel input={acceptedInput()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-latest-evidence-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-cancel-button"));
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("Export validation opens preview modal and confirms JSON download (no fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation(() => {
      throw new Error("export must not perform network calls");
    });
    render(<EcowittIngestValidationPanel input={acceptedInput()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("export-validation-button"));
    });
    const dialog = screen.getByTestId("export-preview-dialog");
    expect(dialog.textContent).toContain("Local EcoWitt validation — last 10 attempts");
    expect(screen.getByTestId("export-preview-attempt-count").textContent).toBe("1");
    // Confirm JSON
    await act(async () => {
      fireEvent.click(screen.getByTestId("export-download-json-button"));
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Export preview surfaces CSV download when helper available", async () => {
    render(<EcowittIngestValidationPanel input={acceptedInput()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("export-validation-button"));
    });
    expect(screen.getByTestId("export-download-csv-button")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("export-download-csv-button"));
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("Export and Copy preview modals never render secrets/tokens/auth/user_id/internal IDs", async () => {
    render(<EcowittIngestValidationPanel input={acceptedInput()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("export-validation-button"));
    });
    const exportDialog = screen.getByTestId("export-preview-dialog");
    for (const secret of [
      "SECRET-TOKEN",
      "BRIDGE-yyy",
      "Bearer zzz",
      "srv-key",
      "sig-abc",
      "ak-123",
      "uuid-of-user",
      "internal-row-id-12345",
    ]) {
      expect(exportDialog.textContent).not.toContain(secret);
    }
  });
});

describe("CSV serializer", () => {
  it("emits one row per (attempt × metric), capped to last 10 attempts, with redacted output", async () => {
    const { buildEcowittValidationExport, serializeExportCsv } =
      await import("@/lib/ecowittValidationExportRules");
    const { buildEcowittIngestValidationViewModel } =
      await import("@/lib/ecowittIngestValidationViewModel");
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`,
      source: "ecowitt",
      captured_at: new Date(NOW.getTime() - i * 60_000).toISOString(),
      ts: new Date(NOW.getTime() - i * 60_000).toISOString(),
      metric: "temp_f",
      value: 70 + i,
      raw_payload: {
        test_sender: true,
        invalid_test: false,
        token: "SECRET-CSV",
        authorization: "Bearer csv",
        api_key: "ak-csv",
        user_id: "uuid-csv",
        id: "internal-csv",
        signature: "sig-csv",
        metrics: { temp_f: 70 + i, humidity_pct: 50 },
        metadata: { test_sender: true },
      },
    }));
    const vm = buildEcowittIngestValidationViewModel({
      tentId: TENT,
      now: NOW,
      rows,
    });
    const payload = buildEcowittValidationExport({
      tentScopedLabel: vm.tentScopedLabel,
      sourceLabel: vm.sourceLabel,
      now: NOW,
      thresholds: vm.thresholds,
      attempts: vm.exportAttempts,
    });
    const csv = serializeExportCsv(payload);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "captured_at,validation_status,metric,value,metric_status,reason,source_label",
    );
    // 10 attempts × 5 metric rows = 50 + header = 51
    expect(lines.length).toBe(1 + 10 * 5);
    expect(csv).not.toContain("SECRET-CSV");
    expect(csv).not.toContain("Bearer csv");
    expect(csv).not.toContain("ak-csv");
    expect(csv).not.toContain("uuid-csv");
    expect(csv).not.toContain("internal-csv");
    expect(csv).not.toContain("sig-csv");
  });
});

describe("Diary Environment Check link / View affordance", () => {
  it("renders View Environment Check link when alreadyLogged is true", () => {
    render(
      <EcowittIngestValidationPanel
        input={acceptedInput({
          loggedCapturedAts: ["2026-06-07T11:58:00Z"],
        })}
        growId="grow-123"
        loggedEventIdsByCapturedAt={{
          "2026-06-07T11:58:00Z": "grow-event-456",
        }}
      />,
    );
    const link = screen.getByTestId("view-environment-check-link") as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toMatch(/^\/timeline/);
    expect(link.getAttribute("href")).toContain("growId=grow-123");
    expect(link.getAttribute("href")).toBe(
      "/timeline?growId=grow-123#timeline-entry-grow-event-456",
    );
    expect(screen.getByTestId("logged-event-title").textContent).toContain(
      "EcoWitt Environment Check",
    );
    expect(screen.getByTestId("logged-event-captured-at").textContent).toContain(
      "2026-06-07T11:58:00Z",
    );
  });

  it("renders an exact View link after a successful fresh Log even before refetch", async () => {
    const onLog = vi.fn().mockResolvedValue({
      ok: true,
      growEventId: "grow-event-789",
    });
    render(<EcowittIngestValidationPanel input={acceptedInput()} onLogEnvironmentCheck={onLog} />);
    expect(screen.queryByTestId("view-environment-check-link")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("log-environment-check-button"));
    });
    expect(onLog).toHaveBeenCalledTimes(1);
    const link = screen.getByTestId("view-environment-check-link");
    expect(link.getAttribute("href")).toBe("/timeline#timeline-entry-grow-event-789");
    expect(screen.getByTestId("logged-event-title").textContent).toContain(
      "EcoWitt Environment Check",
    );
  });

  it("does not render a success handoff when the diary save fails", async () => {
    const onLog = vi.fn().mockResolvedValue({ ok: false });
    render(<EcowittIngestValidationPanel input={acceptedInput()} onLogEnvironmentCheck={onLog} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("log-environment-check-button"));
    });

    expect(onLog).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("view-environment-check-link")).toBeNull();
  });

  it("does not expose raw UUID-style internal IDs in user-facing copy", () => {
    const { container } = render(
      <EcowittIngestValidationPanel
        input={acceptedInput({
          loggedCapturedAts: ["2026-06-07T11:58:00Z"],
        })}
        growId="grow-123"
      />,
    );
    // The fake row id internal-row-id-12345 must never appear in visible copy.
    expect(container.textContent).not.toContain("internal-row-id-12345");
  });
});

describe("export rules — last 10 attempts + redaction", () => {
  function manyRows(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      id: `r${i}`,
      source: "ecowitt",
      captured_at: new Date(NOW.getTime() - i * 60_000).toISOString(),
      ts: new Date(NOW.getTime() - i * 60_000).toISOString(),
      metric: "temp_f",
      value: 70 + i,
      raw_payload: {
        test_sender: true,
        invalid_test: false,
        token: "SECRET",
        metrics: { temp_f: 70 + i, humidity_pct: 50 },
        metadata: { test_sender: true },
      },
    }));
  }

  it("caps at 10 attempts", () => {
    const vm = buildEcowittIngestValidationViewModel({
      tentId: TENT,
      now: NOW,
      rows: manyRows(25),
    });
    const payload = buildEcowittValidationExport({
      tentScopedLabel: vm.tentScopedLabel,
      sourceLabel: vm.sourceLabel,
      now: NOW,
      thresholds: vm.thresholds,
      attempts: vm.exportAttempts,
    });
    expect(payload.attempts.length).toBeLessThanOrEqual(10);
  });

  it("includes per-metric statuses, reasons, and redacts secrets", () => {
    const vm = buildEcowittIngestValidationViewModel(acceptedInput());
    const payload = buildEcowittValidationExport({
      tentScopedLabel: vm.tentScopedLabel,
      sourceLabel: vm.sourceLabel,
      now: NOW,
      thresholds: vm.thresholds,
      attempts: vm.exportAttempts,
    });
    const serialized = serializeExport(payload);
    expect(serialized).toMatch(/"status":/);
    expect(serialized).not.toContain("SECRET-TOKEN");
    expect(serialized).not.toContain("Bearer zzz");
    expect(serialized).not.toContain("srv-key");
    expect(serialized).not.toContain("ak-123");
    expect(serialized).not.toContain("uuid-of-user");
    expect(serialized).not.toContain("internal-row-id-12345");
    // accepted metric should appear
    expect(serialized).toContain("temp_f");
  });
});

describe("evidence rules", () => {
  it("buildLatestEvidenceSnapshot returns null when no evidence", () => {
    const snap = buildLatestEvidenceSnapshot({
      hasEvidence: false,
      status: "not_validated",
      statusMessage: "x",
      sourceLabel: "—",
      tentScopedLabel: "—",
      capturedAtLabel: "—",
      isTestSender: false,
      invalidTest: false,
      stale: false,
      metricRows: [],
      rawPayload: null,
      derivedReadingWarnings: [],
    });
    expect(snap).toBeNull();
  });

  it("serialized evidence is labeled as local validation, not live", () => {
    const vm = buildEcowittIngestValidationViewModel(acceptedInput());
    const snap = buildLatestEvidenceSnapshot({
      hasEvidence: vm.hasEvidence,
      status: vm.status,
      statusMessage: vm.statusMessage,
      sourceLabel: vm.sourceLabel,
      tentScopedLabel: vm.tentScopedLabel,
      capturedAtLabel: vm.capturedAtLabel,
      isTestSender: vm.isTestSender,
      invalidTest: vm.invalidTest,
      stale: vm.stale,
      metricRows: vm.metricRows,
      rawPayload: vm.latestRawPayload,
      derivedReadingWarnings: vm.derivedReadingWarnings,
    })!;
    const text = serializeEvidenceForClipboard(snap);
    expect(text).toContain("Local EcoWitt validation evidence");
    expect(text).not.toMatch(/"live"\s*:/i);
  });

  it("redacts secret-shaped raw-payload values even when their keys look safe", () => {
    const secretValues = {
      device_identity: "device_84:F3:EB:21:9C:01",
      tenant_reference: "tenant_123e4567-e89b-42d3-a456-426614174000",
      opaque_material: "0xd41d8cd98f00b204e9800998ecf8427e",
      api_note: "sk-proj-Ab3dEfG7hIjKlMnOpQr",
      config_note: 'VERDANT_CONFIG="private-env-value"',
      nested: { hardware_identity: "24CB88AF4C01" },
    };
    const snap = evidenceSnapshot({
      transport: "mqtt_local_test",
      ...secretValues,
    });
    const text = serializeEvidenceForClipboard(snap);

    expect(text).toContain("mqtt_local_test");
    for (const value of [
      secretValues.device_identity,
      secretValues.tenant_reference,
      secretValues.opaque_material,
      secretValues.api_note,
      secretValues.config_note,
      secretValues.nested.hardware_identity,
    ]) {
      expect(text).not.toContain(value);
    }
    expect(text).toContain("[REDACTED]");
  });

  it("redacts credential assignments inside every reading of a nested batch", () => {
    const secretValues = ["zz-canopy-alpha-77", "zz-canopy-beta-88", "zz-canopy-gamma-99"];
    const snap = evidenceSnapshot({
      readings: [
        {
          sequence: 1,
          detail: `api_key=${secretValues[0]}`,
          temp_f: 77.4,
        },
        {
          sequence: 2,
          detail: `my_password="${secretValues[1]}"`,
          humidity_pct: 56.2,
        },
        {
          sequence: 3,
          detail: `bridge-token: ${secretValues[2]}`,
          note: "temp_f=77.4 inserted=1",
        },
      ],
    });
    const payload = snap.redacted_raw_payload as {
      readings: Array<Record<string, unknown>>;
    };
    const text = serializeEvidenceForClipboard(snap);

    expect(payload.readings).toHaveLength(3);
    expect(payload.readings.map((reading) => reading.detail)).toEqual([
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
    ]);
    expect(payload.readings[0].temp_f).toBe(77.4);
    expect(payload.readings[1].humidity_pct).toBe(56.2);
    expect(payload.readings[2].note).toBe("temp_f=77.4 inserted=1");
    for (const secretValue of secretValues) {
      expect(text).not.toContain(secretValue);
    }
  });

  it("preserves a valid top-level reading batch while redacting every reading deterministically", () => {
    const rawPayload = [
      {
        sequence: 1,
        detail: "api_key=zz-root-alpha-77",
        temp_f: 76.8,
      },
      {
        sequence: 2,
        detail: 'my_secret="zz-root-beta-88"',
        humidity_pct: 55.1,
      },
    ];
    const first = evidenceSnapshot(rawPayload);
    const second = evidenceSnapshot(rawPayload);
    const payload = first.redacted_raw_payload as Array<Record<string, unknown>>;
    const text = serializeEvidenceForClipboard(first);

    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload.map((reading) => reading.detail)).toEqual(["[REDACTED]", "[REDACTED]"]);
    expect(payload[0].temp_f).toBe(76.8);
    expect(payload[1].humidity_pct).toBe(55.1);
    expect(second.redacted_raw_payload).toEqual(payload);
    expect(text).not.toContain("zz-root-alpha-77");
    expect(text).not.toContain("zz-root-beta-88");
  });

  it("keeps empty batches empty and rejects mixed batches without partial readings", () => {
    expect(evidenceSnapshot([]).redacted_raw_payload).toEqual([]);

    const mixed = evidenceSnapshot([
      {
        detail: "api_key=zz-mixed-alpha-77",
        temp_f: 77.2,
      },
      "safe-looking malformed raw body",
    ]);
    const text = serializeEvidenceForClipboard(mixed);

    expect(mixed.redacted_raw_payload).toBe("[redacted]");
    expect(text).toContain('"redacted_raw_payload": "[redacted]"');
    expect(text).not.toContain("zz-mixed-alpha-77");
    expect(text).not.toContain("safe-looking malformed raw body");
    expect(text).not.toContain("77.2");
  });

  it("redacts a PASSKEY field even when its value has no recognizable secret shape", () => {
    const snap = evidenceSnapshot({
      transport: "mqtt_local_test",
      PASSKEY: "flower-room-credential",
    });
    const payload = snap.redacted_raw_payload as Record<string, unknown>;
    const text = serializeEvidenceForClipboard(snap);

    expect(payload.PASSKEY).toBe("[redacted]");
    expect(text).not.toContain("flower-room-credential");
  });

  it.each([
    ["PASSKEY=flower-room-credential", "flower-room-credential"],
    ['SERVICE_ROLE="service-role-credential"', "service-role-credential"],
  ] as const)(
    "redacts the whole credential assignment in a safe-key string: %s",
    (credentialAssignment, secretValue) => {
      const snap = evidenceSnapshot({
        transport: "mqtt_local_test",
        config_note: credentialAssignment,
      });
      const payload = snap.redacted_raw_payload as Record<string, unknown>;
      const text = serializeEvidenceForClipboard(snap);

      expect(payload.config_note).toBe("[REDACTED]");
      expect(text).not.toContain(secretValue);
    },
  );

  it("redacts every sensitive credential label when it appears in a safe-key string", () => {
    const credentialAssignments = [
      ["PassKey=plain-passkey-987", "plain-passkey-987"],
      ["JWT: plain-jwt-987", "plain-jwt-987"],
      ['signature="plain-signature-987"', "plain-signature-987"],
      ["vBt=plain-vbt-987", "plain-vbt-987"],
      ["user_id: plain-user-id-987", "plain-user-id-987"],
    ] as const;

    const redactedValues = credentialAssignments.map(([credentialAssignment]) => {
      const snap = evidenceSnapshot({
        transport: "mqtt_local_test",
        config_note: credentialAssignment,
      });
      const payload = snap.redacted_raw_payload as Record<string, unknown>;
      return payload.config_note;
    });
    const text = credentialAssignments
      .map(([credentialAssignment]) =>
        serializeEvidenceForClipboard(
          evidenceSnapshot({
            transport: "mqtt_local_test",
            config_note: credentialAssignment,
          }),
        ),
      )
      .join("\n");

    expect(redactedValues).toEqual(credentialAssignments.map(() => "[REDACTED]"));
    for (const [, secretValue] of credentialAssignments) {
      expect(text).not.toContain(secretValue);
    }
  });

  it("redacts a credential pair whose JSON key is quoted inside a safe-key string", () => {
    const secretValue = "flower-room-json-credential";
    const snap = evidenceSnapshot({
      transport: "mqtt_local_test",
      config_note: `{"api_key":"${secretValue}","temp_f":77.4}`,
    });
    const payload = snap.redacted_raw_payload as Record<string, unknown>;
    const text = serializeEvidenceForClipboard(snap);

    expect(payload.config_note).toBe('{[REDACTED],"temp_f":77.4}');
    expect(text).not.toContain(secretValue);
    expect(text).toContain("temp_f");
    expect(text).toContain("77.4");
  });

  // Header-prefixed assignments. The header patterns CONSUME the whole following
  // token, variable NAME included, so if they run before the assignment rule the
  // NAME is gone and `[A-Z][A-Z0-9_]{2,}=` can no longer match — leaving the VALUE
  // in both redacted_raw_payload and the clipboard export. Distinct from the
  // label-fragmenting case above: this one needs NO credential label in the NAME
  // at all, so a plain SOME_PLAIN_NAME behind a `Bearer ` prefix leaked too.
  // Reported by Copilot on #1184 and confirmed by execution before the fix.
  it.each([
    ["Authorization: Bearer actualtoken123456", "actualtoken123456"],
    ["Authorization: Basic Zmxvd2VyOnJvb20tc2VjcmV0", "Zmxvd2VyOnJvb20tc2VjcmV0"],
    ["Authorization: Digest ZGlnZXN0OnNlY3JldA==", "ZGlnZXN0OnNlY3JldA=="],
    ["Authorization: Negotiate bmVnb3RpYXRlLXNlY3JldA==", "bmVnb3RpYXRlLXNlY3JldA=="],
    ["Authorization: NTLM TlRMTVNTUAABAAAAB4IIog==", "TlRMTVNTUAABAAAAB4IIog=="],
    ['Authorization: PASSKEY="flower-room-credential"', "flower-room-credential"],
    ["Bearer PASSKEY=flower-room-credential", "flower-room-credential"],
    ['Bearer MY_PASSKEY_VAR="flower-room-credential"', "flower-room-credential"],
    ['Bearer SOME_PLAIN_NAME="flower-room-credential"', "flower-room-credential"],
    ['Authorization: SOME_PLAIN_NAME="flower-room-credential"', "flower-room-credential"],
    ['authorization: MY_PASSKEY_VAR="flower-room-credential"', "flower-room-credential"],
  ] as const)(
    "redacts the credential assignment behind a header prefix: %s",
    (credentialAssignment, secretValue) => {
      const snap = evidenceSnapshot({
        transport: "mqtt_local_test",
        config_note: credentialAssignment,
      });
      const payload = snap.redacted_raw_payload as Record<string, unknown>;
      const text = serializeEvidenceForClipboard(snap);

      expect(payload.config_note, `value survived in: ${credentialAssignment}`).not.toContain(
        secretValue,
      );
      expect(text).not.toContain(secretValue);
    },
  );

  it.each([
    ['Authorization: Digest username="grower"', "[REDACTED]"],
    ['Authorization: NTLM username="grower"', "[REDACTED]"],
    ['Authorization: Negotiate opaque="x"', "[REDACTED]"],
  ] as const)(
    "redacts the whole quoted attribute on a reserved authorization scheme: %s",
    (authorizationHeader, expected) => {
      const snap = evidenceSnapshot({
        transport: "mqtt_local_test",
        request_log: authorizationHeader,
      });
      const payload = snap.redacted_raw_payload as Record<string, unknown>;
      const text = serializeEvidenceForClipboard(snap);

      expect(payload.request_log).toBe(expected);
      expect(text).not.toContain(authorizationHeader);
    },
  );

  // #1222 closed the FIRST quoted attribute on a reserved scheme, but stopped
  // there: the match ended at the first attribute, so every later comma-separated
  // pair survived into `redacted_raw_payload` and the clipboard export. A short,
  // non-hex secret in any position but the first therefore leaked, and
  // parameterized `Basic` leaked entirely because `Basic` was absent from that
  // branch and fell through to the value tail, which stops at the first quote.
  // Verified RED on parent 1f68d7d3 before this fix.
  it.each([
    [
      'Authorization: Digest username="grower", realm="verdant", nonce="secret"',
      ["grower", "verdant", "secret"],
    ],
    [
      'Authorization: NTLM username="grower", realm="verdant", nonce="secret"',
      ["grower", "verdant", "secret"],
    ],
    [
      'Authorization: Negotiate username="grower", realm="verdant", nonce="secret"',
      ["grower", "verdant", "secret"],
    ],
    ['Authorization: Basic username="grower", nonce="secret"', ["grower", "secret"]],
  ] as const)(
    "redacts the whole parameterized authorization header, remainder included: %s",
    (authorizationHeader, leakedValues) => {
      const snap = evidenceSnapshot({
        transport: "mqtt_local_test",
        request_log: authorizationHeader,
      });
      const payload = snap.redacted_raw_payload as Record<string, unknown>;
      const text = serializeEvidenceForClipboard(snap);

      expect(payload.request_log).toBe("[REDACTED]");
      for (const leaked of leakedValues) {
        expect(payload.request_log, `remainder survived in: ${authorizationHeader}`).not.toContain(
          leaked,
        );
        expect(text).not.toContain(leaked);
      }
    },
  );

  it("still redacts a real header credential, and leaves benign telemetry alone", () => {
    const snap = evidenceSnapshot({
      transport: "mqtt_local_test",
      config_note: "Bearer abc123def456ghi",
      note: "tent stable",
      temp_f: 77.4,
    });
    const payload = snap.redacted_raw_payload as Record<string, unknown>;

    expect(payload.config_note).not.toContain("abc123def456ghi");
    expect(payload.note).toBe("tent stable");
    expect(payload.temp_f).toBe(77.4);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["scalar", "safe-looking malformed raw body"],
    ["array", ["safe-looking malformed raw body"]],
  ] as const)(
    "marks %s raw payload as unusable instead of serializing it",
    (_label, rawPayload) => {
      const snap = evidenceSnapshot(rawPayload);
      const text = serializeEvidenceForClipboard(snap);

      expect(snap.redacted_raw_payload).toBe("[redacted]");
      expect(text).toContain('"redacted_raw_payload": "[redacted]"');
      expect(text).not.toContain("safe-looking malformed raw body");
    },
  );

  it("replaces malformed nested values instead of omitting or serializing them", () => {
    class UnexpectedPayloadValue {
      body = "safe-looking nested raw body";
    }

    const snap = evidenceSnapshot({
      transport: "mqtt_local_test",
      missing: undefined,
      non_finite: Number.NaN,
      unexpected: new UnexpectedPayloadValue(),
    });
    const payload = snap.redacted_raw_payload as Record<string, unknown>;
    const text = serializeEvidenceForClipboard(snap);

    expect(payload).toEqual({
      transport: "mqtt_local_test",
      missing: "[redacted]",
      non_finite: "[redacted]",
      unexpected: "[redacted]",
    });
    expect(text).not.toContain("safe-looking nested raw body");
  });
});

describe("safety: panel + helpers do not introduce writes / device control", () => {
  const panelSrc = readFileSync(
    path.resolve(__dirname, "../components/EcowittIngestValidationPanel.tsx"),
    "utf8",
  );
  const evidenceSrc = readFileSync(
    path.resolve(__dirname, "../lib/ecowittValidationEvidenceRules.ts"),
    "utf8",
  );
  const exportSrc = readFileSync(
    path.resolve(__dirname, "../lib/ecowittValidationExportRules.ts"),
    "utf8",
  );
  const diarySrc = readFileSync(
    path.resolve(__dirname, "../lib/ecowittDiaryEnvironmentCheckRules.ts"),
    "utf8",
  );
  const vmSrc = readFileSync(
    path.resolve(__dirname, "../lib/ecowittIngestValidationViewModel.ts"),
    "utf8",
  );

  const allSources = [panelSrc, evidenceSrc, exportSrc, diarySrc, vmSrc].join("\n");

  it("does not insert/update/delete sensor_readings", () => {
    expect(allSources).not.toMatch(/from\(["']sensor_readings["']\)/);
    expect(allSources).not.toMatch(/sensor_readings.*\.(insert|update|delete|upsert)/);
  });

  it("does not call functions.invoke", () => {
    expect(allSources).not.toMatch(/functions\.invoke/);
  });

  it("does not write to action_queue", () => {
    expect(allSources).not.toMatch(/action_queue/);
  });

  it("does not include device-control strings", () => {
    expect(allSources).not.toMatch(/(\bdevice[_-]?control\b|\bdevice[_-]?command\b|\bactuator\b)/i);
  });
});
