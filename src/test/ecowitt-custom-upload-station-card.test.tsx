import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EcowittCustomUploadStationCard } from "@/components/EcowittCustomUploadStationCard";
import { ECOWITT_CUSTOM_UPLOAD_COPY } from "@/constants/ecowittCustomUploadCopy";
import { buildEcowittCustomUploadStationCard } from "@/lib/ecowittCustomUploadStationCardViewModel";

describe("EcoWitt customized-upload station card", () => {
  it("renders the empty state and the gateway settings", () => {
    const model = buildEcowittCustomUploadStationCard({
      tentId: "22222222-2222-4222-8222-222222222222",
      now: new Date("2026-11-02T18:00:30.000Z"),
      lastReceivedAt: null,
      claimState: "none",
      justCreatedToken: null,
      readings: [],
    });
    const onCreateLink = vi.fn();
    render(<EcowittCustomUploadStationCard model={model} onCreateLink={onCreateLink} />);
    expect(screen.getByTestId("ecowitt-custom-upload-empty")).toHaveTextContent(
      ECOWITT_CUSTOM_UPLOAD_COPY.empty,
    );
    expect(screen.queryByTestId("ecowitt-custom-upload-temp")).toBeNull();
    expect(screen.getByTestId("ecowitt-custom-upload-setting-path")).toHaveTextContent(
      "ew/<claim token>",
    );
    expect(screen.getByTestId("ecowitt-custom-upload-setting-port")).toHaveTextContent("80");
    expect(screen.getByTestId("ecowitt-custom-upload-setting-protocol")).toHaveTextContent(
      "Ecowitt",
    );
    fireEvent.click(screen.getByTestId("ecowitt-custom-upload-create"));
    expect(onCreateLink).toHaveBeenCalledOnce();
  });
});
