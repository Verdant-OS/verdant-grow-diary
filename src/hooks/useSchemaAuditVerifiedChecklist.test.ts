import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { SchemaAuditChecklistScope } from "@/lib/schemaAuditRules";
import { useSchemaAuditVerifiedChecklist } from "./useSchemaAuditVerifiedChecklist";

const scope: SchemaAuditChecklistScope = {
  user_id: "user-a",
  backend_ref: "project-a.supabase.co",
  checked_at: "2026-07-28T15:00:00.000Z",
  snapshot_fingerprint: "0123456789abcdef0123456789abcdef",
};

describe("useSchemaAuditVerifiedChecklist", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("stores marks only for the exact snapshot scope", async () => {
    const { result, rerender } = renderHook(
      ({ currentScope }) => useSchemaAuditVerifiedChecklist(currentScope),
      { initialProps: { currentScope: scope as SchemaAuditChecklistScope | null } },
    );

    act(() => result.current.toggle("column:plants.id"));
    expect(result.current.isVerified("column:plants.id")).toBe(true);

    rerender({
      currentScope: {
        ...scope,
        snapshot_fingerprint: "fedcba9876543210fedcba9876543210",
      },
    });
    await waitFor(() => expect(result.current.count).toBe(0));
    expect(result.current.isVerified("column:plants.id")).toBe(false);
  });

  it.each([
    ["user_id", "user-b"],
    ["backend_ref", "project-b.supabase.co"],
    ["checked_at", "2026-07-28T15:01:00.000Z"],
  ] as const)("clears when %s changes", async (field, value) => {
    const { result, rerender } = renderHook(
      ({ currentScope }) => useSchemaAuditVerifiedChecklist(currentScope),
      { initialProps: { currentScope: scope as SchemaAuditChecklistScope | null } },
    );
    act(() => result.current.toggle("rls:plants"));
    expect(result.current.count).toBe(1);

    rerender({ currentScope: { ...scope, [field]: value } });
    await waitFor(() => expect(result.current.count).toBe(0));
  });

  it("does not accept marks without a verified scope", () => {
    const { result } = renderHook(() => useSchemaAuditVerifiedChecklist(null));
    act(() => result.current.toggle("table:plants"));
    expect(result.current.count).toBe(0);
    expect(result.current.scoped).toBe(false);
  });

  it("does not restore marks after the active scope is cleared and re-entered", async () => {
    const { result, rerender } = renderHook(
      ({ currentScope }) => useSchemaAuditVerifiedChecklist(currentScope),
      { initialProps: { currentScope: scope as SchemaAuditChecklistScope | null } },
    );
    act(() => result.current.toggle("table:plants"));
    expect(result.current.count).toBe(1);

    rerender({ currentScope: null });
    await waitFor(() => expect(result.current.count).toBe(0));
    rerender({ currentScope: scope });
    await waitFor(() => expect(result.current.scoped).toBe(true));
    expect(result.current.count).toBe(0);
  });
});
