import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const TENT_A = "33333333-3333-4333-8333-333333333333";
const TENT_B = "44444444-4444-4444-8444-444444444444";
const BRIDGE_A = "55555555-5555-4555-8555-555555555555";
const BRIDGE_B = "66666666-6666-4666-8666-666666666666";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      {
        id: BRIDGE_A,
        name: "Bridge A",
        token_prefix: "vbt_a",
        expires_at: "2099-01-01T00:00:00.000Z",
        last_used_at: null,
        first_used_at: null,
        ingest_count: 0,
        revoked_at: null,
        created_at: "2026-07-25T00:00:00.000Z",
      },
      {
        id: BRIDGE_B,
        name: "Bridge B",
        token_prefix: "vbt_b",
        expires_at: "2099-01-01T00:00:00.000Z",
        last_used_at: null,
        first_used_at: null,
        ingest_count: 0,
        revoked_at: null,
        created_at: "2026-07-25T00:00:00.000Z",
      },
    ],
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      { id: TENT_A, name: "Tent A" },
      { id: TENT_B, name: "Tent B" },
    ],
  }),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      disabled={disabled}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <input
      {...props}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

import GgsRealPayloadIngestPanel from "@/components/GgsRealPayloadIngestPanel";

describe("GgsRealPayloadIngestPanel attestation reset", () => {
  it("requires a fresh attestation after tent, bridge, device, or payload changes", () => {
    let selectedTentId = TENT_A;
    const { rerender } = render(
      <GgsRealPayloadIngestPanel
        selectedTentId={selectedTentId}
        onSelectedTentIdChange={(tentId) => {
          selectedTentId = tentId;
        }}
      />,
    );

    const [tentSelect, bridgeSelect] = screen.getAllByRole("combobox");
    const deviceInput = screen.getByLabelText("Physical probe / sensor id");
    const payloadInput = screen.getAllByRole("textbox")[1];
    const attestation = screen.getByLabelText("Operator attestation");

    fireEvent.change(bridgeSelect, { target: { value: BRIDGE_A } });
    fireEvent.change(deviceInput, { target: { value: "GGS-PROBE-A" } });
    fireEvent.change(payloadInput, {
      target: {
        value: JSON.stringify({
          timestamp: "2026-07-25T11:59:00.000Z",
          sensor_id: "GGS-PROBE-A",
          tent_id: TENT_A,
          soil_moisture_pct: 42,
          soil_temp_c: 22,
          soil_ec: 1.2,
        }),
      },
    });

    fireEvent.click(attestation);
    expect(attestation).toBeChecked();
    fireEvent.change(deviceInput, { target: { value: "GGS-PROBE-A2" } });
    expect(attestation).not.toBeChecked();

    fireEvent.click(attestation);
    fireEvent.change(payloadInput, { target: { value: "{}" } });
    expect(attestation).not.toBeChecked();

    fireEvent.click(attestation);
    fireEvent.change(bridgeSelect, { target: { value: BRIDGE_B } });
    expect(attestation).not.toBeChecked();

    fireEvent.click(attestation);
    fireEvent.change(tentSelect, { target: { value: TENT_B } });
    rerender(
      <GgsRealPayloadIngestPanel
        selectedTentId={selectedTentId}
        onSelectedTentIdChange={(tentId) => {
          selectedTentId = tentId;
        }}
      />,
    );
    expect(screen.getByLabelText("Operator attestation")).not.toBeChecked();
  });
});
