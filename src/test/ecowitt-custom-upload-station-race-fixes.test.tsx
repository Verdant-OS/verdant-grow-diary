/**
 * @source-scan-justified: rotate's write check lives in an unapplied migration,
 * so the pin reads that file instead of calling the database.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EcowittCustomUploadStationCard } from "@/components/EcowittCustomUploadStationCard";
import { EcowittCustomUploadStationMount } from "@/components/EcowittCustomUploadStationMount";
import type { EcowittClaimMountClient } from "@/components/EcowittCustomUploadStationMount";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import { buildEcowittCustomUploadStationCard } from "@/lib/ecowittCustomUploadStationCardViewModel";

const TENT = "22222222-2222-4222-8222-222222222222";
const TENT_B = "33333333-3333-4333-8333-333333333333";
const CLAIM = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-02T18:00:30.000Z");

const OPEN_ROW = {
  id: CLAIM,
  bound_at: "2026-11-02T18:00:00.000Z",
  revoked_at: null,
  last_received_at: "2026-11-02T18:00:00.000Z",
  interval_seconds: 16,
};

describe("EcoWitt station race fixes", () => {
  it("shows query numeric strings as tent air, not indoor sensors", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: "2026-11-02T18:00:00.000Z",
      claimState: "active",
      justCreatedToken: null,
      readings: [
        {
          tentId: TENT,
          metric: "temperature_c",
          value: "22.222222",
          source: "live",
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
        {
          tentId: TENT,
          metric: "humidity_pct",
          value: "55.0",
          source: "live",
          quality: "ok",
          capturedAt: "2026-11-02T18:00:00.000Z",
        },
      ],
    });
    expect(model.emptyMessage).toBeNull();
    expect(model.indoorTempF).toBe("72.0 °F");
    expect(model.indoorRh).toBe("55 %");

    render(<EcowittCustomUploadStationCard model={model} />);
    expect(screen.getByTestId("ecowitt-custom-upload-temp")).toHaveTextContent(
      ECOWITT_CUSTOM_UPLOAD_COPY.airTemp,
    );
    expect(screen.getByTestId("ecowitt-custom-upload-rh")).toHaveTextContent(
      ECOWITT_CUSTOM_UPLOAD_COPY.airRh,
    );
    expect(screen.queryByText("Indoor temperature")).toBeNull();
    expect(screen.queryByText("Indoor humidity")).toBeNull();
  });

  it("hides create until the open claim loads, and drops the previous tent's link", async () => {
    const gates = new Map<string, (value: { data: unknown; error: null }) => void>();
    const rpc = vi.fn(async () => ({ data: null, error: { message: "unexpected" } }));
    const claims = {
      rpc,
      from: () => ({
        select: () => ({
          eq: (_column: string, tentId: string) => ({
            is: () => ({
              maybeSingle: () =>
                new Promise((resolve) => {
                  gates.set(tentId, resolve);
                }),
            }),
          }),
        }),
      }),
    } as unknown as EcowittClaimMountClient;

    const { rerender } = render(
      <EcowittCustomUploadStationMount tentId={TENT} readings={[]} now={NOW} claims={claims} />,
    );
    expect(screen.queryByTestId("ecowitt-custom-upload-create")).toBeNull();
    expect(screen.queryByTestId("ecowitt-custom-upload-revoke")).toBeNull();
    expect(screen.queryByTestId("ecowitt-custom-upload-rotate")).toBeNull();

    await act(async () => {
      gates.get(TENT)?.({ data: OPEN_ROW, error: null });
    });
    expect(await screen.findByTestId("ecowitt-custom-upload-revoke")).toBeTruthy();
    expect(screen.getByTestId("ecowitt-custom-upload-rotate")).toBeTruthy();
    expect(screen.queryByTestId("ecowitt-custom-upload-create")).toBeNull();

    rerender(
      <EcowittCustomUploadStationMount tentId={TENT_B} readings={[]} now={NOW} claims={claims} />,
    );
    expect(screen.queryByTestId("ecowitt-custom-upload-revoke")).toBeNull();
    expect(screen.queryByTestId("ecowitt-custom-upload-rotate")).toBeNull();
    expect(screen.queryByTestId("ecowitt-custom-upload-create")).toBeNull();

    await act(async () => {
      gates.get(TENT)?.({ data: OPEN_ROW, error: null });
    });
    expect(screen.queryByTestId("ecowitt-custom-upload-revoke")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();

    await act(async () => {
      gates.get(TENT_B)?.({ data: null, error: null });
    });
    expect(await screen.findByTestId("ecowitt-custom-upload-create")).toBeTruthy();
    expect(screen.queryByTestId("ecowitt-custom-upload-revoke")).toBeNull();
  });

  it("refuses to return a rotate token the update did not store", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../supabase/migrations/20261102150000_ecowitt_custom_upload_claims.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("AND token_sha256 = previous_hash");
    expect(migration).toMatch(
      /SET token_sha256 = token_hash[\s\S]*?AND token_sha256 = previous_hash;[\s\S]*?IF NOT FOUND THEN\s+RAISE EXCEPTION 'claim not found';\s+END IF;\s+RETURN raw_token;/,
    );
  });
});
