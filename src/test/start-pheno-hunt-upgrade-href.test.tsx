/**
 * StartPhenoHuntButton pricing returnTo is the checkout sanitizer's output.
 * A safe in-app new-hunt path is preserved. A backslash in the tent id is
 * rejected (the same smuggle sanitizeCheckoutReturnTo drops) and is not
 * encoded into returnTo. No plan param — that pin stays on the locked test.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { resolveEntitlements } from "@/lib/entitlements/resolveEntitlements";

const GROW = "4cad3cae-21e3-42f8-8372-2f6237205db3";
const TENT = "tent-77";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: resolveEntitlements(null, new Date("2026-08-01T00:00:00Z")),
    refetch: async () => {},
  }),
}));

import StartPhenoHuntButton from "@/components/StartPhenoHuntButton";

function href(): string | null {
  const node = screen.getByTestId("start-pheno-hunt-btn");
  const anchor = node.tagName === "A" ? node : node.closest("a");
  return anchor?.getAttribute("href") ?? null;
}

function renderButton(props: { growId: string; tentId?: string | null }) {
  return render(
    <MemoryRouter>
      <StartPhenoHuntButton growId={props.growId} tentId={props.tentId} />
    </MemoryRouter>,
  );
}

describe("StartPhenoHuntButton returnTo sanitization", () => {
  beforeEach(() => {
    authState.user = { id: "user-1" };
  });

  it("preserves a valid in-app new-hunt path as returnTo", () => {
    renderButton({ growId: GROW, tentId: TENT });
    const target = `/pheno-hunts/new?growId=${GROW}&tentId=${TENT}`;
    expect(href()).toBe(`/pricing?returnTo=${encodeURIComponent(target)}`);
  });

  it("rejects a backslash tent id instead of encoding it into returnTo", () => {
    renderButton({ growId: GROW, tentId: "\\\\evil.example" });
    expect(href()).toBe("/pricing");
  });
});
