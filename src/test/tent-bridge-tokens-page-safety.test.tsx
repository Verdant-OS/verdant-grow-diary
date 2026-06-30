/**
 * Integration safety test for TentBridgeTokensCard rendered inside the
 * Tent page surface area.
 *
 * Guarantees:
 *   - Non-UUID fixture tent ids (e.g. "t1") never hit Supabase's
 *     `bridge_tokens` table and never surface raw Postgres errors.
 *   - Valid UUID tent ids render metadata-only safe fields and never
 *     leak token secrets, hashes, ciphertext, nonce, key version, or
 *     service_role text.
 *   - Failure copy is calm and grower-readable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TentBridgeTokensCard from "@/components/TentBridgeTokensCard";

type SelectResult = { data: unknown; error: unknown };

const bridgeTokensSelectSpy: ReturnType<typeof vi.fn> = vi.fn(
  async (): Promise<SelectResult> => ({ data: [], error: null }),
);
const fromSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: (table: string) => {
        fromSpy(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => bridgeTokensSelectSpy(),
        };
        return chain;
      },
      functions: { invoke: vi.fn() },
    },
  };
});

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const FORBIDDEN_LEAK_TERMS = [
  "22P02",
  "invalid input syntax for type uuid",
  "PostgrestError",
  "Postgres",
  "SQL",
  "token_hash",
  "secret_hash",
  "secret_ciphertext",
  "secret_nonce",
  "secret_key_version",
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
];

function assertNoLeaks() {
  const body = document.body.textContent ?? "";
  for (const term of FORBIDDEN_LEAK_TERMS) {
    expect(body).not.toContain(term);
  }
}

describe("TentBridgeTokensCard — page integration safety", () => {
  beforeEach(() => {
    bridgeTokensSelectSpy.mockReset();
    fromSpy.mockReset();
  });

  it("non-UUID fixture tent id ('t1') never queries bridge_tokens", async () => {
    render(<TentBridgeTokensCard tentId="t1" />);
    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    });
    expect(bridgeTokensSelectSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalledWith("bridge_tokens");
    expect(
      screen.getByText(/No bridge tokens yet/i),
    ).toBeInTheDocument();
    assertNoLeaks();
  });

  it("renders calm copy and never leaks raw DB error text on failure", async () => {
    bridgeTokensSelectSpy.mockResolvedValueOnce({
      data: null,
      error: {
        code: "22P02",
        message: "invalid input syntax for type uuid",
        details: "PostgrestError raw SQL detail",
      },
    });
    render(
      <TentBridgeTokensCard tentId="11111111-1111-1111-1111-111111111111" />,
    );
    await screen.findByTestId("bridge-token-load-failed");
    expect(
      screen.getByText(/Bridge token status unavailable/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Token secrets were not loaded/i)).toBeInTheDocument();
    assertNoLeaks();
  });

  it("renders metadata-only fields for a valid UUID and never leaks secret fields", async () => {
    bridgeTokensSelectSpy.mockResolvedValueOnce({
      data: [
        {
          id: "tok-1",
          name: "esp32-shelf-1",
          token_prefix: "vbt_abc",
          expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
          last_used_at: null,
          first_used_at: null,
          ingest_count: 42,
          revoked_at: null,
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    render(
      <TentBridgeTokensCard tentId="22222222-2222-2222-2222-222222222222" />,
    );
    await screen.findByText(/esp32-shelf-1/);
    assertNoLeaks();
  });
});
