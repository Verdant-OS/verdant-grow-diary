import { describe, it, expect } from "vitest";
import { loadDemoEvidenceChainFixture } from "@/lib/demoEvidenceChainFixture";

describe("demoEvidenceChainFixture", () => {
  const fx = loadDemoEvidenceChainFixture();

  it("is deterministic / idempotent across loads", () => {
    const a = loadDemoEvidenceChainFixture();
    const b = loadDemoEvidenceChainFixture();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("labels the reading as demo, never live", () => {
    expect(fx.reading.source).toBe("demo");
    expect(fx.snapshot.source).toBe("demo");
  });

  it("alert carries exactly one safe sensor_snapshot ref pointing at the seeded reading", () => {
    expect(fx.alert.originating_timeline_events).toHaveLength(1);
    const ref = fx.alert.originating_timeline_events[0];
    expect(ref.id).toBe(fx.reading.id);
    expect(ref.type).toBe("sensor_snapshot");
    expect(ref.source).toBe("demo");
  });

  it("action_queue ref is forwarded from alert ref", () => {
    expect(fx.action.originating_timeline_events).toHaveLength(1);
    expect(fx.action.originating_timeline_events[0].id).toBe(
      fx.alert.originating_timeline_events[0].id,
    );
  });

  it("action_queue stays approval-required", () => {
    expect(fx.action.status).toBe("pending_approval");
  });

  it("grow is in a Post-Grow-eligible state (archived + harvest stage)", () => {
    expect(fx.grow.is_archived).toBe(true);
    expect(fx.grow.stage).toBe("harvest");
    expect(typeof fx.grow.harvested_at).toBe("string");
  });

  it("snapshot.metric_refs[metric] equals the seeded reading id", () => {
    expect(fx.snapshot.metric_refs[fx.reading.metric]).toBe(fx.reading.id);
  });
});
