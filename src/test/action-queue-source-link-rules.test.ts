/**
 * actionQueueSourceLinkRules — pure helper tests.
 *
 * Verifies safe route derivation. The helper must:
 *  - require both source enum + parseable token for alert / AI doctor
 *  - fall back to plant > tent > grow for manual / unknown sources
 *  - never put a raw UUID into the visible label
 *  - return null (forcing "Source link unavailable.") on missing/unsafe input
 */
import { describe, it, expect } from "vitest";
import {
  buildActionQueueSourceLink,
  SOURCE_LINK_UNAVAILABLE_COPY,
} from "@/lib/actionQueueSourceLinkRules";

describe("buildActionQueueSourceLink — alert source", () => {
  it("links to the alert detail route when source + token agree", () => {
    const link = buildActionQueueSourceLink({
      source: "environment_alert",
      reason: "Mold risk rising [alert:alert-123]",
    });
    expect(link).not.toBeNull();
    expect(link!.kind).toBe("alert");
    expect(link!.href).toMatch(/\/alerts\//);
    expect(link!.href).toContain("alert-123");
    expect(link!.label).toBe("View originating alert");
    // Visible label must not embed the raw ID.
    expect(link!.label).not.toContain("alert-123");
  });

  it("returns null when the source enum is right but the token is missing", () => {
    const link = buildActionQueueSourceLink({
      source: "environment_alert",
      reason: "No back-pointer here",
    });
    expect(link).toBeNull();
  });

  it("returns null when the token is malformed", () => {
    const link = buildActionQueueSourceLink({
      source: "environment_alert",
      reason: "Mold risk [alert:!!!bad chars!!!]",
    });
    expect(link).toBeNull();
  });
});

describe("buildActionQueueSourceLink — AI Doctor source", () => {
  it("links to the AI Doctor session route when source + token agree", () => {
    const link = buildActionQueueSourceLink({
      source: "ai_doctor",
      reason: "Possible nutrient burn [session:sess-abc]",
    });
    expect(link).not.toBeNull();
    expect(link!.kind).toBe("ai_doctor");
    expect(link!.href).toContain("sess-abc");
    expect(link!.label).toBe("View AI Doctor session");
    expect(link!.label).not.toContain("sess-abc");
  });

  it("returns null when the AI Doctor token is missing", () => {
    const link = buildActionQueueSourceLink({
      source: "ai_doctor",
      reason: "No session marker here",
    });
    expect(link).toBeNull();
  });
});

describe("buildActionQueueSourceLink — manual fallback", () => {
  it("prefers plant when available", () => {
    const link = buildActionQueueSourceLink({
      source: "manual",
      plant_id: "p-1",
      tent_id: "t-1",
      grow_id: "g-1",
    });
    expect(link).not.toBeNull();
    expect(link!.kind).toBe("plant");
    expect(link!.href).toBe("/plants/p-1");
    expect(link!.label).toBe("Open related plant");
    expect(link!.label).not.toContain("p-1");
  });

  it("falls back to tent when no plant", () => {
    const link = buildActionQueueSourceLink({
      source: "manual",
      tent_id: "t-1",
      grow_id: "g-1",
    });
    expect(link!.kind).toBe("tent");
    expect(link!.href).toBe("/tents/t-1");
  });

  it("falls back to grow when no plant or tent", () => {
    const link = buildActionQueueSourceLink({
      source: "manual",
      grow_id: "g-1",
    });
    expect(link!.kind).toBe("grow");
    expect(link!.href).toBe("/grows/g-1");
  });

  it("returns null when no related context exists", () => {
    expect(buildActionQueueSourceLink({ source: "manual" })).toBeNull();
    expect(buildActionQueueSourceLink({ source: "" })).toBeNull();
    expect(buildActionQueueSourceLink({})).toBeNull();
  });

  it("rejects unsafe / non-canonical id shapes", () => {
    expect(
      buildActionQueueSourceLink({ source: "manual", plant_id: "../etc/passwd" }),
    ).toBeNull();
    expect(
      buildActionQueueSourceLink({
        source: "manual",
        plant_id: "p 1 with space",
      }),
    ).toBeNull();
  });
});

describe("SOURCE_LINK_UNAVAILABLE_COPY", () => {
  it("uses calm, non-automation copy", () => {
    expect(SOURCE_LINK_UNAVAILABLE_COPY).toBe("Source link unavailable.");
    expect(SOURCE_LINK_UNAVAILABLE_COPY.toLowerCase()).not.toContain("safe");
    expect(SOURCE_LINK_UNAVAILABLE_COPY.toLowerCase()).not.toContain("healthy");
  });
});
