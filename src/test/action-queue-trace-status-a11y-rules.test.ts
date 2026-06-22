import { describe, it, expect } from "vitest";
import {
  buildTraceStatusAnnouncement,
  TRACE_STATUS_ANNOUNCEMENT_COPY,
} from "@/lib/actionQueueTraceStatusA11yRules";

describe("buildTraceStatusAnnouncement", () => {
  it("stays silent on initial render of idle rows to avoid noisy lists", () => {
    expect(
      buildTraceStatusAnnouncement({
        state: "idle",
        previousState: null,
        isInitial: true,
      }),
    ).toBeNull();
  });

  it("announces non-idle states on initial render", () => {
    expect(
      buildTraceStatusAnnouncement({
        state: "failed",
        previousState: null,
        isInitial: true,
      }),
    ).toBe("Trace failed");
    expect(
      buildTraceStatusAnnouncement({
        state: "retrying",
        previousState: null,
        isInitial: true,
      }),
    ).toBe("Retrying trace");
  });

  it("announces meaningful changes between states", () => {
    expect(
      buildTraceStatusAnnouncement({
        state: "failed",
        previousState: "idle",
        isInitial: false,
      }),
    ).toBe("Trace failed");
    expect(
      buildTraceStatusAnnouncement({
        state: "retrying",
        previousState: "failed",
        isInitial: false,
      }),
    ).toBe("Retrying trace");
    expect(
      buildTraceStatusAnnouncement({
        state: "idle",
        previousState: "retrying",
        isInitial: false,
      }),
    ).toBe("Trace OK");
  });

  it("returns null when state has not changed", () => {
    expect(
      buildTraceStatusAnnouncement({
        state: "failed",
        previousState: "failed",
        isInitial: false,
      }),
    ).toBeNull();
  });

  it("copy never exposes internal ids and avoids 'safe'/'healthy'/device language", () => {
    for (const value of Object.values(TRACE_STATUS_ANNOUNCEMENT_COPY)) {
      expect(value).not.toMatch(/aq-|uuid|[0-9a-f]{8}-/i);
      expect(value.toLowerCase()).not.toMatch(/safe|healthy|device|equipment/);
    }
  });
});
