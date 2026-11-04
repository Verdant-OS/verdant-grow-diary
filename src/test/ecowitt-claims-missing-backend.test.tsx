import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EcowittCustomUploadStationMount,
  type EcowittClaimMountClient,
} from "@/components/EcowittCustomUploadStationMount";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import { EcowittClaimsBackendAvailability } from "@/lib/ecowittClaimsBackendAvailability";
import type { EcowittClaimRpcResult } from "@/lib/ecowittCustomUploadClaimService";

const TENT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-03T18:00:00.000Z");

function client(
  load: EcowittClaimRpcResult,
  create?: EcowittClaimRpcResult,
): EcowittClaimMountClient {
  return {
    rpc: vi.fn(async () => create ?? { data: null, error: { message: "unused" }, status: 500 }),
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: async () => load }) }),
      }),
    }),
  } as unknown as EcowittClaimMountClient;
}

function mount(claims: EcowittClaimMountClient) {
  return render(
    <EcowittCustomUploadStationMount tentId={TENT} readings={[]} now={NOW} claims={claims} />,
  );
}

describe("EcowittClaimsBackendAvailability.isMissingBackend", () => {
  it.each([
    [{ code: "PGRST205" }],
    [{ code: "PGRST202" }],
    [{ code: "42P01" }],
    [{ code: "42883" }],
    [{ status: 404 }],
  ])("treats %o as a missing backend", (error) => {
    expect(EcowittClaimsBackendAvailability.isMissingBackend(error)).toBe(true);
  });

  it.each([
    [null],
    [undefined],
    [{ status: 500 }],
    [{ status: 401, code: "PGRST301" }],
    [{ status: 0, message: "TypeError: Failed to fetch" }],
    [{ code: "42501" }],
    [{ message: "relation does not exist" }],
  ])("treats %o as a real error", (error) => {
    expect(EcowittClaimsBackendAvailability.isMissingBackend(error)).toBe(false);
  });
});

describe("EcoWitt station mount when the claims backend is not deployed", () => {
  it.each([
    ["HTTP 404", { data: null, error: { message: "Not Found" }, status: 404 }],
    ["PGRST205", { data: null, error: { message: "no table", code: "PGRST205" }, status: 404 }],
  ])("renders nothing when the claims table read returns %s", async (_label, load) => {
    const { container } = mount(client(load));
    await waitFor(() => expect(screen.queryByTestId("ecowitt-custom-upload-station")).toBeNull());
    expect(container.textContent ?? "").not.toContain(ECOWITT_CUSTOM_UPLOAD_COPY.lookupFailed);
    expect(container.innerHTML).toBe("");
  });

  it.each([
    ["HTTP 404", { data: null, error: { message: "Not Found" }, status: 404 }],
    ["PGRST202", { data: null, error: { message: "no fn", code: "PGRST202" }, status: 404 }],
  ])("hides the card with no error when create returns %s", async (_label, created) => {
    const { container } = mount(client({ data: null, error: null, status: 200 }, created));
    const button = await screen.findByTestId("ecowitt-custom-upload-create");
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByTestId("ecowitt-custom-upload-station")).toBeNull());
    expect(container.textContent ?? "").not.toContain(ECOWITT_CUSTOM_UPLOAD_COPY.createFailed);
  });

  it("still shows the lookup error on a 500", async () => {
    mount(client({ data: null, error: { message: "boom", code: "XX000" }, status: 500 }));
    expect(await screen.findByText(ECOWITT_CUSTOM_UPLOAD_COPY.lookupFailed)).toBeTruthy();
    expect(screen.getByTestId("ecowitt-custom-upload-station")).toBeTruthy();
  });

  it("still shows the create error on a 500", async () => {
    mount(
      client(
        { data: null, error: null, status: 200 },
        { data: null, error: { message: "boom" }, status: 500 },
      ),
    );
    fireEvent.click(await screen.findByTestId("ecowitt-custom-upload-create"));
    expect(await screen.findByText(ECOWITT_CUSTOM_UPLOAD_COPY.createFailed)).toBeTruthy();
  });
});
