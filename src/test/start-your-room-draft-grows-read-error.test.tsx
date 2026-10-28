import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";
import { SESSION_FORM_DRAFT_VERSION } from "@/lib/sessionFormDraftRules";
import { writeBrowserSessionFormDraft } from "@/lib/sessionFormDraftStore";
import { START_YOUR_ROOM_DRAFT_FORM_ID } from "@/lib/startYourRoomDraftRules";

// CodeRabbit review 5677337277 (#2565): a failed grow-roster read must not
// hydrate a tent-step draft against an empty roster and overwrite it.

const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PENDING_TENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const testState = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
  growsError: null as string | null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: OWNER_ID }, loading: false }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: testState.grows,
    loading: false,
    error: testState.growsError,
    activeGrowId: testState.grows[0]?.id ?? null,
    activeGrow: testState.grows[0] ?? null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
        insert: vi.fn(),
      };
      return chain;
    },
  },
}));

import StartYourRoom from "@/pages/StartYourRoom";

const draftKey = `verdant.session-form.${SESSION_FORM_DRAFT_VERSION}.${OWNER_ID}.${START_YOUR_ROOM_DRAFT_FORM_ID}`;

function page() {
  return (
    <MemoryRouter>
      <StartYourRoom />
    </MemoryRouter>
  );
}

describe("Start your room draft hydration after a failed grow read", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    testState.grows = [];
    testState.growsError = "Could not load grows";
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps a tent-step draft until the grow roster reads, then resumes it", async () => {
    writeBrowserSessionFormDraft(OWNER_ID, START_YOUR_ROOM_DRAFT_FORM_ID, {
      step: "tent",
      form: { growName: "North run", tentName: "Tent A", plantName: "", plantStage: "seedling" },
      ids: { growId: GROW_ID, tentId: null, plantId: null },
      pendingRowIds: { grow: null, tent: PENDING_TENT_ID, plant: null },
      saveError: null,
    });
    const view = render(page());

    // The failed read leaves the stored draft exactly as it was.
    const whileFailed = window.sessionStorage.getItem(draftKey) ?? "";
    expect(whileFailed).toContain(GROW_ID);
    expect(whileFailed).toContain(PENDING_TENT_ID);
    expect(whileFailed).toContain('"step":"tent"');

    testState.grows = [{ id: GROW_ID, name: "North run" }];
    testState.growsError = null;
    view.rerender(page());

    // One-step form (VER-296): the resumed draft stays bound to its grow.
    expect(await screen.findByTestId("start-room-bound-grow")).toHaveTextContent("North run");
    expect(screen.queryByTestId("start-room-grow-name")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(draftKey)).toContain(PENDING_TENT_ID);
  });
});
