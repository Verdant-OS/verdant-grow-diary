/**
 * genetics-propagation-read-error-hooks
 *
 * The query hooks must turn typed API read failures into React Query error
 * states so presenters cannot mistake an unavailable read for zero rows.
 */
import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  listAccessions: vi.fn(),
  listBatches: vi.fn(),
  listScreeningForSubject: vi.fn(),
  listQuarantineForSubject: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));

vi.mock("@/lib/genetics/traceabilityApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/genetics/traceabilityApi")>();
  return {
    ...actual,
    listAccessions: mocks.listAccessions,
    listBatches: mocks.listBatches,
    listScreeningForSubject: mocks.listScreeningForSubject,
    listQuarantineForSubject: mocks.listQuarantineForSubject,
  };
});

import { useAccessions, useBatches } from "@/hooks/useGeneticsLibrary";
import { useSubjectQuarantine, useSubjectScreening } from "@/hooks/useGeneticsTrace";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.listAccessions.mockReset().mockResolvedValue({ ok: true, data: [] });
  mocks.listBatches.mockReset().mockResolvedValue({ ok: true, data: [] });
  mocks.listScreeningForSubject.mockReset().mockResolvedValue({ ok: true, data: [] });
  mocks.listQuarantineForSubject.mockReset().mockResolvedValue({ ok: true, data: [] });
});

describe("genetics read hooks", () => {
  it.each([
    ["accessions", mocks.listAccessions, () => useAccessions()],
    ["batches", mocks.listBatches, () => useBatches()],
    ["screening", mocks.listScreeningForSubject, () => useSubjectScreening("plant", "plant-1")],
    ["quarantine", mocks.listQuarantineForSubject, () => useSubjectQuarantine("plant", "plant-1")],
  ])(
    "surfaces a typed %s read failure as an error, never empty success",
    async (_label, read, useHook) => {
      read.mockResolvedValueOnce({ ok: false, error: "read_failed" });

      const { result } = renderHook(() => useHook(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toMatchObject({
        name: "GeneticsReadError",
        code: "read_failed",
      });
    },
  );

  it("preserves successful empty accessions as an empty success", async () => {
    const { result } = renderHook(() => useAccessions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([]);
  });
});
