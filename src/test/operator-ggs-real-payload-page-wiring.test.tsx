import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const chainCalls: Array<[string, ...unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  const step = (name: string) =>
    vi.fn((...args: unknown[]) => {
      chainCalls.push([name, ...args]);
      return chain;
    });
  Object.assign(chain, {
    select: step("select"),
    eq: step("eq"),
    contains: step("contains"),
    in: step("in"),
    order: step("order"),
    limit: vi.fn(async (...args: unknown[]) => {
      chainCalls.push(["limit", ...args]);
      return { data: [], error: null };
    }),
  });
  return {
    queryOptions: null as null | {
      enabled: boolean;
      queryKey: unknown[];
      queryFn: () => Promise<unknown>;
    },
    refetch: vi.fn(async () => undefined),
    chainCalls,
    chain,
    from: vi.fn(() => chain),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: {
    enabled: boolean;
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
  }) => {
    state.queryOptions = options;
    return { data: [], refetch: state.refetch };
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: state.from },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
  }),
}));

vi.mock("@/hooks/useHasRole", () => ({
  useHasRole: () => ({ status: "granted", error: null }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Flower",
      },
    ],
  }),
}));

vi.mock("@/components/GgsRealPayloadIngestPanel", () => ({
  default: ({
    selectedTentId,
    onSelectedTentIdChange,
    onCommitSuccess,
  }: {
    selectedTentId: string;
    onSelectedTentIdChange: (tentId: string) => void;
    onCommitSuccess: () => unknown;
  }) => (
    <div data-testid="controlled-ggs-panel">
      <output data-testid="selected-tent">{selectedTentId}</output>
      <button
        type="button"
        onClick={() => onSelectedTentIdChange("33333333-3333-4333-8333-333333333333")}
      >
        Select flower tent
      </button>
      <button type="button" onClick={() => onCommitSuccess()}>
        Simulate successful commit
      </button>
    </div>
  ),
}));

import OperatorGgsRealPayloadIngest from "@/pages/OperatorGgsRealPayloadIngest";

describe("OperatorGgsRealPayloadIngest wiring", () => {
  beforeEach(() => {
    state.queryOptions = null;
    state.refetch.mockClear();
    state.chainCalls.length = 0;
    state.from.mockClear();
  });

  it("lifts tent selection and enables the exact canonical Sentinel query", async () => {
    render(<OperatorGgsRealPayloadIngest />);

    expect(state.queryOptions?.enabled).toBe(false);
    expect(screen.getByTestId("selected-tent")).toHaveTextContent("");

    fireEvent.click(screen.getByRole("button", { name: "Select flower tent" }));

    expect(screen.getByTestId("selected-tent")).toHaveTextContent(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(state.queryOptions?.enabled).toBe(true);
    expect(state.queryOptions?.queryKey).toEqual([
      "operator-ggs-real-payload",
      "33333333-3333-4333-8333-333333333333",
    ]);

    await state.queryOptions?.queryFn();

    expect(state.from).toHaveBeenCalledWith("sensor_readings");
    expect(state.chainCalls).toEqual([
      ["select", "metric,value,source,quality,device_id,captured_at,raw_payload"],
      ["eq", "tent_id", "33333333-3333-4333-8333-333333333333"],
      ["eq", "source", "live"],
      [
        "contains",
        "raw_payload",
        {
          source_app: "spider_farmer_ggs",
          provenance: "operator_attested_real_payload",
          operator_attestation: {
            attested: true,
            boundary: "operator-ggs-real-payload-commit",
          },
        },
      ],
      ["in", "metric", ["soil_moisture_pct", "ec", "soil_temp_c"]],
      ["order", "captured_at", { ascending: false }],
      ["limit", 50],
    ]);
  });

  it("wires a confirmed commit to one Sentinel refetch", () => {
    render(<OperatorGgsRealPayloadIngest />);
    fireEvent.click(screen.getByRole("button", { name: "Simulate successful commit" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("describes the route as gated commit plus read-only Sentinel", () => {
    render(<OperatorGgsRealPayloadIngest />);
    expect(
      screen.getByText(
        /Commit validated, attested Spider Farmer GGS readings.*read-only Sentinel verdict/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not presented as independently verified live telemetry/i),
    ).toBeInTheDocument();
  });
});
