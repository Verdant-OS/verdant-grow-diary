import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readNativeWaterRecovery } from "../../e2e-local/lib/nativeWaterRecoveryStorage";
import { typedWaterRecoveryKey } from "@/lib/quickLogWaterRecoveryKeys";

const key = typedWaterRecoveryKey("fixture-owner");
const record = {
  version: 1,
  ownerId: "fixture-owner",
  payload: { idempotency_key: "original-water-key", volume_ml: 750 },
};
const tabRead = vi.fn();
const sharedRead = vi.fn();

describe("native Water recovery storage probe", () => {
  beforeEach(() => {
    tabRead.mockReset().mockReturnValue(null);
    sharedRead.mockReset().mockReturnValue(null);
    vi.stubGlobal("sessionStorage", { getItem: tabRead });
    vi.stubGlobal("localStorage", { getItem: sharedRead });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the unchanged tab-scoped claim and only its exact owner key", () => {
    tabRead.mockReturnValue(JSON.stringify(record));
    expect(readNativeWaterRecovery(key)).toEqual(record);
    expect(tabRead.mock.calls).toEqual([[key]]);
    expect(sharedRead.mock.calls).toEqual([[key]]);
  });

  it("reports empty only when both copies are absent", () => {
    expect(readNativeWaterRecovery(key)).toBeNull();
  });

  it.each([null, JSON.stringify(record)])(
    "refuses a cross-tab copy with tab value %s",
    (tabValue) => {
      tabRead.mockReturnValue(tabValue);
      sharedRead.mockReturnValue(JSON.stringify(record));
      expect(() => readNativeWaterRecovery(key)).toThrow("cross-tab recovery copy");
    },
  );

  it.each(["{", "null", "[]", '"text"', "42", "true"])(
    "refuses malformed tab evidence %s",
    (raw) => {
      tabRead.mockReturnValue(raw);
      expect(() => readNativeWaterRecovery(key)).toThrow();
    },
  );

  it.each(["tab", "shared"])("fails the proof when %s storage cannot be read", (which) => {
    (which === "tab" ? tabRead : sharedRead).mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => readNativeWaterRecovery(key)).toThrow("storage unavailable");
  });

  it("returns identical evidence on repeated reads", () => {
    tabRead.mockReturnValue(JSON.stringify(record));
    expect(readNativeWaterRecovery(key)).toEqual(readNativeWaterRecovery(key));
  });
});
