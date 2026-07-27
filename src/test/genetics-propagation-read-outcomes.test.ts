/**
 * genetics-propagation-read-outcomes
 *
 * Read failures are unavailable evidence, not empty evidence. The API boundary
 * returns a typed failure for authentication, query, and malformed-response
 * failures while preserving a genuine empty result as a successful read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: {
    authResult: {
      data: { user: { id: string } | null };
      error: { message: string } | null;
    };
    readResult: {
      data: unknown[] | null;
      error: { message: string } | null;
    };
  } = {
    authResult: { data: { user: { id: "owner-1" } }, error: null },
    readResult: { data: [], error: null },
  };

  const query: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => unknown;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    is: vi.fn(),
  };
  for (const method of ["select", "eq", "order", "limit", "is"] as const) {
    query[method].mockImplementation(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve(state.readResult).then(resolve, reject);

  return {
    state,
    query,
    getUser: vi.fn(),
    from: vi.fn(),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
  },
}));

vi.mock("@/integrations/supabase/geneticsTraceabilityTables", () => ({
  geneticsTraceabilityDb: {
    from: mocks.from,
    rpc: vi.fn(),
  },
}));

import {
  GeneticsReadError,
  listAccessions,
  listBatches,
  listQuarantineForSubject,
  listScreeningForSubject,
  unwrapGeneticsReadResult,
} from "@/lib/genetics/traceabilityApi";

beforeEach(() => {
  mocks.state.authResult = {
    data: { user: { id: "owner-1" } },
    error: null,
  };
  mocks.state.readResult = { data: [], error: null };
  mocks.getUser.mockReset().mockImplementation(async () => mocks.state.authResult);
  mocks.from.mockReset().mockImplementation(() => mocks.query);
});

describe("genetics traceability read outcomes", () => {
  it("preserves a genuine empty accessions read as successful empty data", async () => {
    await expect(listAccessions()).resolves.toEqual({ ok: true, data: [] });
  });

  it("maps accessions without changing the existing DTO shape", async () => {
    mocks.state.readResult = {
      data: [
        {
          id: "accession-1",
          source_kind: "seed",
          source_party: null,
          cultivar_name: "Northern Lights",
          line_name: null,
          generation: "F1",
          acquisition_date: null,
          known_state: "known",
          archived_at: null,
        },
      ],
      error: null,
    };

    await expect(listAccessions()).resolves.toEqual({
      ok: true,
      data: [
        {
          id: "accession-1",
          sourceKind: "seed",
          sourceParty: null,
          cultivarName: "Northern Lights",
          lineName: null,
          generation: "F1",
          acquisitionDate: null,
          knownState: "known",
          archivedAt: null,
        },
      ],
    });
  });

  it.each([
    ["accessions", () => listAccessions()],
    ["batches", () => listBatches()],
    ["screening", () => listScreeningForSubject("plant", "plant-1")],
    ["quarantine", () => listQuarantineForSubject("plant", "plant-1")],
  ])("fails closed when the %s query returns a backend error", async (_label, read) => {
    mocks.state.readResult = {
      data: null,
      error: { message: "backend detail must not become empty data" },
    };

    await expect(read()).resolves.toEqual({ ok: false, error: "read_failed" });
  });

  it("distinguishes a malformed null payload from a successful empty read", async () => {
    mocks.state.readResult = { data: null, error: null };

    await expect(listBatches()).resolves.toEqual({
      ok: false,
      error: "unexpected_response",
    });
  });

  it("fails closed when the authenticated user check fails and does not query owner data", async () => {
    mocks.state.authResult = {
      data: { user: null },
      error: { message: "auth unavailable" },
    };

    await expect(listAccessions()).resolves.toEqual({
      ok: false,
      error: "authentication_failed",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed when the authenticated user response contains no user", async () => {
    mocks.state.authResult = {
      data: { user: null },
      error: null,
    };

    await expect(listBatches()).resolves.toEqual({
      ok: false,
      error: "authentication_failed",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("unwraps success and throws a typed, non-backend-detail error for query consumers", () => {
    expect(unwrapGeneticsReadResult({ ok: true, data: ["accession-1"] })).toEqual(["accession-1"]);

    expect(() => unwrapGeneticsReadResult({ ok: false, error: "read_failed" })).toThrowError(
      GeneticsReadError,
    );
    try {
      unwrapGeneticsReadResult({ ok: false, error: "read_failed" });
    } catch (error) {
      expect(error).toMatchObject({
        name: "GeneticsReadError",
        code: "read_failed",
        message: "Genetics data could not be loaded.",
      });
    }
  });
});
