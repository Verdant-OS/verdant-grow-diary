/**
 * Configured grow-target "Why this alert?" context for target-comparison alerts (#2179).
 */
import { describe, expect, it } from "vitest";
import { deriveAlertWhyContext, type AlertLike } from "@/lib/alertWhyContext";

describe("deriveAlertWhyContext — configured target range in reason (#2179)", () => {
  it("parses RH configured target from the persisted reason string", () => {
    const alert: AlertLike = {
      metric: "rh",
      title: "Humidity above target",
      reason: "Humidity is above the configured maximum. Observed 85% (configured target 50–70%).",
    };
    const w = deriveAlertWhyContext(alert);
    expect(w.kind).toBe("configured");
    if (w.kind === "configured") {
      expect(w.metric).toBe("rh");
      expect(w.text).toContain("50–70%");
      expect(w.text).not.toContain("Target context unavailable");
    }
  });

  it("converts configured temp °C range to °F for default display preference", () => {
    const alert: AlertLike = {
      metric: "temp",
      title: "Temperature above target",
      reason:
        "Temperature is above the configured maximum. Observed 31°C (configured target 22–28°C).",
    };
    const w = deriveAlertWhyContext(alert);
    expect(w.kind).toBe("configured");
    expect(w.text).toContain("°F");
    expect(w.text).not.toContain("22–28°C");
  });
});
