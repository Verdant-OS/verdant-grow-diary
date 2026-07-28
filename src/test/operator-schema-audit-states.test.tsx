import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));
vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

import OperatorSchemaAudit from "@/pages/OperatorSchemaAudit";

describe("OperatorSchemaAudit trust states", () => {
  beforeEach(() => {
    rpc.mockReset();
    window.sessionStorage.clear();
  });

  it("shows loading and then unverified for a null RPC response without green success copy", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    render(<OperatorSchemaAudit />);

    expect(screen.getByTestId("schema-audit-trust-state")).toHaveAttribute("data-state", "loading");
    expect(screen.queryByText(/Complete snapshot:/)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId("schema-audit-trust-state")).toHaveAttribute(
        "data-state",
        "unverified",
      ),
    );
    expect(screen.queryByText(/Complete snapshot:/)).not.toBeInTheDocument();
  });

  it("shows an RPC failure as error rather than an empty successful audit", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "forbidden" } });
    render(<OperatorSchemaAudit />);

    await waitFor(() =>
      expect(screen.getByTestId("schema-audit-trust-state")).toHaveAttribute("data-state", "error"),
    );
    expect(screen.getByText("Audit unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Complete snapshot:/)).not.toBeInTheDocument();
  });

  it("renders malformed row collections as partial instead of crashing or turning green", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        migrations: [null],
        tables: [null],
        columns: [null],
        rls_audit: [null],
        user_id: "4e345ed7-58c2-4f5b-a984-260775363b25",
        checked_at: "2026-07-28T15:00:00.000Z",
        snapshot_fingerprint: "0123456789abcdef0123456789abcdef",
      },
      error: null,
    });
    render(<OperatorSchemaAudit />);

    await waitFor(() =>
      expect(screen.getByTestId("schema-audit-trust-state")).toHaveAttribute(
        "data-state",
        "partial",
      ),
    );
    expect(screen.queryByText(/Complete snapshot:/)).not.toBeInTheDocument();
  });
});
