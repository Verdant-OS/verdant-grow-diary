/**
 * Bottom-bar Tent button opens the grower's tent and falls back to Home.
 * Bug from Cheek's phone pass (2026-11-19): Tent always went to the Dashboard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { resolveMobileTentHref } from "@/lib/mobileTentNavRules";

const harness = vi.hoisted(() => ({
  tents: undefined as Array<Record<string, unknown>> | undefined,
  activeGrowId: null as string | null,
}));

vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: harness.tents }) }));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ activeGrowId: harness.activeGrowId }) }));
vi.mock("@/components/OperatorModeLink", () => ({ default: () => null }));

import MobileNav from "@/components/MobileNav";

const T1 = { id: "t1", grow_id: "g1" };
const T2 = { id: "t2", grow_id: "g2" };

describe("resolveMobileTentHref (pure)", () => {
  it("falls back to Home when tents are unknown or empty", () => {
    expect(resolveMobileTentHref({ pathname: "/", tents: undefined })).toBe("/");
    expect(resolveMobileTentHref({ pathname: "/", tents: null })).toBe("/");
    expect(resolveMobileTentHref({ pathname: "/", tents: [] })).toBe("/");
  });

  it("opens the only tent", () => {
    expect(resolveMobileTentHref({ pathname: "/timeline", tents: [T1] })).toBe("/tents/t1");
  });

  it("keeps the tent the grower is already on", () => {
    expect(resolveMobileTentHref({ pathname: "/tents/t2", tents: [T1, T2] })).toBe("/tents/t2");
  });

  it("ignores a tent path that is not one of the grower's tents", () => {
    expect(resolveMobileTentHref({ pathname: "/tents/zzz", tents: [T1, T2] })).toBe("/");
  });

  it("uses the active grow's only tent when there are several tents", () => {
    expect(resolveMobileTentHref({ pathname: "/", tents: [T1, T2], activeGrowId: "g2" })).toBe(
      "/tents/t2",
    );
  });

  it("does not guess between several tents with no signal", () => {
    expect(resolveMobileTentHref({ pathname: "/", tents: [T1, T2] })).toBe("/");
    expect(
      resolveMobileTentHref({
        pathname: "/",
        tents: [T1, { id: "t3", grow_id: "g1" }],
        activeGrowId: "g1",
      }),
    ).toBe("/");
  });

  it("skips malformed rows and encodes the id", () => {
    expect(
      resolveMobileTentHref({ pathname: "/", tents: [null, { id: "" }, { id: "a b" }] as never }),
    ).toBe("/tents/a%20b");
  });
});

function renderAt(path: string, children: ReactNode = <MobileNav />) {
  return render(<MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>);
}

function tentLink() {
  const nav = screen.getByRole("navigation", { name: "Primary navigation" });
  return within(nav).getByText("Tent").closest("a");
}

beforeEach(() => {
  harness.tents = undefined;
  harness.activeGrowId = null;
});
afterEach(cleanup);

describe("MobileNav Tent button", () => {
  it("opens the grower's tent", () => {
    harness.tents = [T1];
    renderAt("/timeline");
    expect(tentLink()).toHaveAttribute("href", "/tents/t1");
  });

  it("falls back to Home with no tent", () => {
    harness.tents = [];
    renderAt("/timeline");
    expect(tentLink()).toHaveAttribute("href", "/");
  });

  it("marks Tent as the current page on that tent", () => {
    harness.tents = [T1];
    renderAt("/tents/t1");
    expect(tentLink()).toHaveAttribute("aria-current", "page");
  });
});
