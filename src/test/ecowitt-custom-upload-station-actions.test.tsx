import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EcowittCustomUploadStationCard } from "@/components/EcowittCustomUploadStationCard";
import { EcowittCustomUploadStationMount } from "@/components/EcowittCustomUploadStationMount";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import type { EcowittClaimMountClient } from "@/components/EcowittCustomUploadStationMount";
import {
  buildEcowittCustomUploadStationCard,
  ecowittStationClaimState,
  resolveEcowittStationMountClaim,
} from "@/lib/ecowittCustomUploadStationCardViewModel";

const TENT = "22222222-2222-4222-8222-222222222222";
const CLAIM = "44444444-4444-4444-8444-444444444444";
const TOKEN = "cd".repeat(24);
const NOW = new Date("2026-11-02T18:00:30.000Z");

describe("EcoWitt station revoke and rotate", () => {
  it("offers revoke and rotate only for an open claim", () => {
    expect(ecowittStationClaimState(null)).toBe("none");
    expect(ecowittStationClaimState({ boundAt: null, revokedAt: null })).toBe("unbound");
    expect(ecowittStationClaimState({ boundAt: "2026-11-02T18:00:00.000Z", revokedAt: null })).toBe(
      "active",
    );
    expect(
      ecowittStationClaimState({
        boundAt: "2026-11-02T18:00:00.000Z",
        revokedAt: "2026-11-02T18:01:00.000Z",
      }),
    ).toBe("revoked");

    const active = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: "2026-11-02T18:00:00.000Z",
      claimState: "active",
      claimId: CLAIM,
      justCreatedToken: null,
      readings: [],
    });
    expect(active.canCreateLink).toBe(false);
    expect(active.canRevoke).toBe(true);
    expect(active.canRotate).toBe(true);

    const none = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: null,
      claimState: "none",
      justCreatedToken: null,
      readings: [],
    });
    expect(none.canRevoke).toBe(false);
    expect(none.canRotate).toBe(false);
    expect(none.canCreateLink).toBe(true);

    const resolved = resolveEcowittStationMountClaim({
      loaded: {
        id: CLAIM,
        boundAt: "2026-11-02T18:00:00.000Z",
        revokedAt: null,
        lastReceivedAt: "2026-11-02T18:00:00.000Z",
        intervalSeconds: 16,
      },
      session: { kind: "rotated", claimId: CLAIM, token: TOKEN },
    });
    expect(resolved.claimState).toBe("active");
    expect(resolved.justCreatedToken).toBe(TOKEN);
    expect(resolved.lastReceivedAt).toBe("2026-11-02T18:00:00.000Z");
  });

  it("clears the previous claim as soon as the tent changes", async () => {
    const claims = {
      rpc: vi.fn(),
      from: () => ({
        select: () => ({
          eq: (_column: string, tent: string) => ({
            is: () => ({
              maybeSingle: () =>
                new Promise((resolve) => {
                  setTimeout(() => {
                    resolve(
                      tent === TENT
                        ? {
                            data: {
                              id: CLAIM,
                              bound_at: "2026-11-02T18:00:00.000Z",
                              revoked_at: null,
                              last_received_at: null,
                              interval_seconds: 16,
                            },
                            error: null,
                          }
                        : { data: null, error: null },
                    );
                  }, 30);
                }),
            }),
          }),
        }),
      }),
    } as unknown as EcowittClaimMountClient;

    function Harness() {
      const [tentId, setTentId] = useState(TENT);
      return (
        <>
          <button type="button" onClick={() => setTentId("33333333-3333-4333-8333-333333333333")}>
            switch
          </button>
          <EcowittCustomUploadStationMount
            tentId={tentId}
            readings={[]}
            now={NOW}
            claims={claims}
          />
        </>
      );
    }

    render(<Harness />);
    expect(await screen.findByTestId("ecowitt-custom-upload-revoke")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.queryByTestId("ecowitt-custom-upload-revoke")).toBeNull();
    expect(screen.queryByTestId("ecowitt-custom-upload-rotate")).toBeNull();
  });

  it("does not offer create until the open-claim load finishes", async () => {
    let finishLoad: (value: unknown) => void = () => undefined;
    const claims = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "exists" } })),
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () =>
                new Promise((resolve) => {
                  finishLoad = resolve;
                }),
            }),
          }),
        }),
      }),
    } as unknown as EcowittClaimMountClient;

    render(
      <EcowittCustomUploadStationMount tentId={TENT} readings={[]} now={NOW} claims={claims} />,
    );
    expect(screen.queryByTestId("ecowitt-custom-upload-create")).toBeNull();
    finishLoad({
      data: {
        id: CLAIM,
        bound_at: null,
        revoked_at: null,
        last_received_at: null,
        interval_seconds: 16,
      },
      error: null,
    });
    expect(await screen.findByTestId("ecowitt-custom-upload-revoke")).toBeTruthy();
  });

  it("renders revoke and rotate from the view model", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: TENT,
      now: NOW,
      lastReceivedAt: null,
      claimState: "unbound",
      claimId: CLAIM,
      justCreatedToken: TOKEN,
      readings: [],
    });
    const onRevokeLink = vi.fn();
    const onRotateLink = vi.fn();
    render(
      <EcowittCustomUploadStationCard
        model={model}
        onRevokeLink={onRevokeLink}
        onRotateLink={onRotateLink}
      />,
    );
    expect(screen.queryByTestId("ecowitt-custom-upload-create")).toBeNull();
    fireEvent.click(screen.getByTestId("ecowitt-custom-upload-revoke"));
    fireEvent.click(screen.getByTestId("ecowitt-custom-upload-rotate"));
    expect(onRevokeLink).toHaveBeenCalledOnce();
    expect(onRotateLink).toHaveBeenCalledOnce();
    expect(screen.getByTestId("ecowitt-custom-upload-revoke")).toHaveTextContent(
      ECOWITT_CUSTOM_UPLOAD_COPY.revokeLink,
    );
  });

  it("loads the open claim and then revokes or rotates it", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "revoke_ecowitt_custom_upload_claim") return { data: true, error: null };
      if (fn === "rotate_ecowitt_custom_upload_claim") return { data: TOKEN, error: null };
      return { data: null, error: { message: "unexpected" } };
    });
    const claims = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({
                data: {
                  id: CLAIM,
                  bound_at: "2026-11-02T18:00:00.000Z",
                  revoked_at: null,
                  last_received_at: "2026-11-02T18:00:00.000Z",
                  interval_seconds: 16,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as EcowittClaimMountClient;

    const { unmount } = render(
      <EcowittCustomUploadStationMount tentId={TENT} readings={[]} now={NOW} claims={claims} />,
    );
    fireEvent.click(await screen.findByTestId("ecowitt-custom-upload-revoke"));
    expect(await screen.findByTestId("ecowitt-custom-upload-create")).toBeTruthy();
    expect(screen.queryByTestId("ecowitt-custom-upload-revoke")).toBeNull();
    unmount();

    render(
      <EcowittCustomUploadStationMount tentId={TENT} readings={[]} now={NOW} claims={claims} />,
    );
    fireEvent.click(await screen.findByTestId("ecowitt-custom-upload-rotate"));
    await waitFor(() => {
      expect(screen.getByTestId("ecowitt-custom-upload-setting-path")).toHaveTextContent(
        `ew/${TOKEN}`,
      );
    });
  });
});
