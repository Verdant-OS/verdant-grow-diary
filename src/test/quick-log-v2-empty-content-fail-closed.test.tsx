/**
 * QUICKLOG_EMPTY_CONTENT_FAIL_CLOSED
 *
 * Live FAIL: target selected + empty critical content still saved
 * ("Saved to your diary" / "Log saved"). Missing-target Save disabled and
 * nonsense volume fail-closed already PASS — this pins the empty-body gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  isQuickLogV2CriticalContentMissing,
  QUICK_LOG_V2_EMPTY_CONTENT_HELPER,
} from "@/lib/quickLogV2Rules";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [{ id: "plant-1", name: "Plant 1", tent_id: "tent-1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", grow_id: "grow-1" }],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "grow-1", name: "Grow 1" }] }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import QuickLogV2Sheet from "@/components/QuickLogV2Sheet";

function renderSheet(defaultTargetKey = "plant:plant-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QuickLogV2Sheet open={true} onOpenChange={() => {}} defaultTargetKey={defaultTargetKey} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: { ok: true, grow_event_id: "ge-1", environment_event_id: null },
    error: null,
  });
});
afterEach(() => cleanup());

describe("isQuickLogV2CriticalContentMissing (pure)", () => {
  const empty = {
    action: "note" as const,
    note: "",
    temperatureC: "",
    humidityPct: "",
    vpdKpa: "",
    hasPhoto: false,
    hasVideo: false,
    hasMaturityEvidence: false,
  };

  it("is missing for note action with empty body and no substitutes", () => {
    expect(isQuickLogV2CriticalContentMissing(empty)).toBe(true);
    expect(isQuickLogV2CriticalContentMissing({ ...empty, note: "  " })).toBe(true);
  });

  it("is present when note, media, reading, or maturity evidence exists", () => {
    expect(isQuickLogV2CriticalContentMissing({ ...empty, note: "droop" })).toBe(false);
    expect(isQuickLogV2CriticalContentMissing({ ...empty, hasPhoto: true })).toBe(false);
    expect(isQuickLogV2CriticalContentMissing({ ...empty, hasVideo: true })).toBe(false);
    expect(isQuickLogV2CriticalContentMissing({ ...empty, temperatureC: "24" })).toBe(false);
    expect(isQuickLogV2CriticalContentMissing({ ...empty, hasMaturityEvidence: true })).toBe(false);
  });

  it("does not gate water or feed (those keep their own validators)", () => {
    expect(isQuickLogV2CriticalContentMissing({ ...empty, action: "water" })).toBe(false);
    expect(isQuickLogV2CriticalContentMissing({ ...empty, action: "feed" })).toBe(false);
  });
});

describe("buildQuickLogV2SavePayload empty-content fail-closed", () => {
  const resolved = {
    ok: true as const,
    targetType: "plant" as const,
    targetId: "plant-1",
    tentId: "tent-1",
    plantId: "plant-1",
  };

  it("rejects target + empty note body with empty_content (no row shape produced)", () => {
    const r = buildQuickLogV2SavePayload({
      resolved,
      action: "note",
      volumeMl: "",
      note: "",
      temperatureC: "",
      humidityPct: "",
      vpdKpa: "",
      idempotencyKey: "quicklog-empty-content-key",
    });
    expect(r).toEqual({ ok: false, reason: "empty_content" });
  });

  it("maps empty_content to clear operator copy", () => {
    expect(quickLogReasonToOperatorMessage("empty_content")).toBe(
      QUICK_LOG_V2_EMPTY_CONTENT_HELPER,
    );
  });
});

describe("QuickLogV2Sheet — target selected + empty content", () => {
  it("disables Save, shows helper, and writes no RPC row", () => {
    renderSheet();
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      QUICK_LOG_V2_EMPTY_CONTENT_HELPER,
    );
    const save = screen.getByTestId("qlv2-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("enables Save after critical note content is entered", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Fan leaf yellowing" },
    });
    expect((screen.getByTestId("qlv2-save") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("qlv2-save-helper")).toHaveTextContent(
      "Ready to save when this log matches what happened.",
    );
  });
});
