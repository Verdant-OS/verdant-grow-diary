/**
 * Presenter tests for PhotoSensorContextBadge.
 * Verifies the non-AI badge always renders, the chosen snapshot is shown
 * through the existing SensorSnapshotCard, and no secrets / raw_payload
 * / private fields reach the DOM.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PhotoSensorContextBadge from "@/components/PhotoSensorContextBadge";

const PHOTO_T = "2026-06-19T12:00:00.000Z";

describe("PhotoSensorContextBadge — badge layer", () => {
  it("always renders the non-AI photo log badge", () => {
    const { getByTestId, getByText } = render(
      <PhotoSensorContextBadge
        photo={{ id: "p1", capturedAtIso: PHOTO_T }}
        nearbyCandidates={[]}
      />,
    );
    expect(getByTestId("photo-sensor-context-badge")).toBeTruthy();
    expect(getByText("Photo log")).toBeTruthy();
    expect(getByText("Non-AI evidence")).toBeTruthy();
    expect(getByText("Visual record only")).toBeTruthy();
  });

  it("never emits AI / diagnosis wording", () => {
    const { container } = render(
      <PhotoSensorContextBadge
        photo={{ id: "p1", capturedAtIso: PHOTO_T }}
        nearbyCandidates={[
          {
            id: "c1",
            captured_at: "2026-06-19T12:01:00.000Z",
            source: "live",
            metrics: [{ key: "temp", value: 22, unit: "°C" }],
          },
        ]}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/\bai\s+diagnos/);
    expect(html).not.toMatch(/likely\s+(disease|deficiency)/);
    // The only "diagnosis" string allowed is the explicit non-diagnostic guard.
    const diagnosisMatches = html.match(/diagnosis/g) ?? [];
    expect(diagnosisMatches.length).toBe(1);
    expect(html).toContain("not a diagnosis");
    expect(html).toContain("do not infer cause");
  });
});

describe("PhotoSensorContextBadge — selection paths", () => {
  it("renders empty state when there is no nearby context", () => {
    const { getByTestId, getByText } = render(
      <PhotoSensorContextBadge
        photo={{ id: "p1", capturedAtIso: PHOTO_T }}
        nearbyCandidates={[]}
      />,
    );
    expect(getByTestId("photo-sensor-context-empty")).toBeTruthy();
    expect(
      getByText("No nearby sensor snapshot available for this photo."),
    ).toBeTruthy();
  });

  it("shows attached snapshot badge when one is attached", () => {
    const { getByTestId } = render(
      <PhotoSensorContextBadge
        photo={{
          id: "p1",
          capturedAtIso: PHOTO_T,
          attachedSnapshot: {
            id: "attached",
            captured_at: PHOTO_T,
            source: "manual",
          },
        }}
        nearbyCandidates={[
          { id: "c1", captured_at: PHOTO_T, source: "live" },
        ]}
      />,
    );
    expect(getByTestId("photo-sensor-context-attached")).toBeTruthy();
  });

  it("shows delta label for nearest match", () => {
    const { getByTestId } = render(
      <PhotoSensorContextBadge
        photo={{ id: "p1", capturedAtIso: PHOTO_T }}
        nearbyCandidates={[
          {
            id: "c1",
            captured_at: "2026-06-19T12:05:00.000Z",
            source: "csv",
          },
        ]}
      />,
    );
    const delta = getByTestId("photo-sensor-context-delta");
    expect(delta.textContent).toMatch(/after photo/);
  });
});

describe("PhotoSensorContextBadge — safety: no secret / raw payload leakage", () => {
  it("does not render raw_payload, tokens, MACs, JWTs, api keys", () => {
    const hostile = {
      id: "c1",
      captured_at: "2026-06-19T12:01:00.000Z",
      source: "live" as const,
      raw_payload: { mac: "AA:BB:CC:DD:EE:FF", token: "eyJabc.eyJdef.sig" },
      api_key: "sk_live_secret",
      bridge_token: "tok_xyz",
      passkey: "p@ss",
      mac_address: "11:22:33:44:55:66",
      vendor_id: "vendor-private-123",
      service_role: "sr_secret",
      metrics: [{ key: "temp", value: 22, unit: "°C" }],
    };
    const { container } = render(
      <PhotoSensorContextBadge
        photo={{ id: "p1", capturedAtIso: PHOTO_T }}
        nearbyCandidates={[hostile]}
      />,
    );
    const html = container.innerHTML;
    expect(html).not.toContain("raw_payload");
    expect(html).not.toContain("api_key");
    expect(html).not.toContain("sk_live_secret");
    expect(html).not.toContain("bridge_token");
    expect(html).not.toContain("tok_xyz");
    expect(html).not.toContain("passkey");
    expect(html).not.toContain("p@ss");
    expect(html).not.toContain("AA:BB:CC:DD:EE:FF");
    expect(html).not.toContain("11:22:33:44:55:66");
    expect(html).not.toContain("vendor-private-123");
    expect(html).not.toContain("service_role");
    expect(html).not.toMatch(/eyj[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i);
  });

  it("never reclassifies csv as live", () => {
    const { container } = render(
      <PhotoSensorContextBadge
        photo={{ id: "p1", capturedAtIso: PHOTO_T }}
        nearbyCandidates={[
          {
            id: "c1",
            captured_at: "2026-06-19T12:01:00.000Z",
            source: "csv",
            metrics: [{ key: "temp", value: 22, unit: "°C" }],
          },
        ]}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    // SensorSourceBadge surfaces the resolved source; CSV must not be
    // promoted to "live".
    expect(html).not.toContain(">live<");
  });
});
