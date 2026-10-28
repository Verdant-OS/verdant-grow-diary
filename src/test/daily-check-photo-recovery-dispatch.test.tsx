/**
 * Runtime proof that a confirmed photo-attachment recovery dispatches
 * `verdant:entry-created` with `activityId: "photo"`.
 *
 * The later photo-save success path is a different dispatch, immediately
 * after `eventType: "photo"`. This case mounts the section with a stored
 * recovery lock and a confirmed owner-scoped diary row, and never clicks
 * Save, so only the recovery effect can emit the event.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import QuickLogAllActivitiesSection from "@/components/QuickLogAllActivitiesSection";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { recordQuickLogPhotoAttachmentRecoveryLock } from "@/lib/quickLogPhotoAttachmentRecovery";

const DIARY_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "user-1";
const GROW_ID = "grow-1";
const TENT_ID = "tent-1";
const PLANT_ID = "plant-1";

const diaryMaybeSingleMock = vi.fn(async () => ({
  data: { id: DIARY_ID },
  error: null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: { path: "p" }, error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
      }),
    },
    from: () => ({
      insert: vi.fn(async () => ({ error: null })),
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: diaryMaybeSingleMock }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/quickLogSuccessTelemetry", () => ({
  trackQuickLogSuccess: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: OWNER_ID }, loading: false }),
}));

beforeEach(() => {
  window.sessionStorage.clear();
  diaryMaybeSingleMock.mockClear();
  diaryMaybeSingleMock.mockImplementation(async () => ({
    data: { id: DIARY_ID },
    error: null,
  }));
});

describe("recovered photo diary confirmation", () => {
  it("dispatches activityId photo from the recovery path", async () => {
    recordQuickLogPhotoAttachmentRecoveryLock(
      { ownerId: OWNER_ID, growId: GROW_ID, tentId: TENT_ID, plantId: PLANT_ID },
      DIARY_ID,
    );

    const events: Array<Record<string, unknown>> = [];
    const handler = (event: Event) => {
      events.push((event as CustomEvent).detail as Record<string, unknown>);
    };
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);

    render(
      <MemoryRouter>
        <QuickLogAllActivitiesSection
          growId={GROW_ID}
          tentId={TENT_ID}
          plantId={PLANT_ID}
          plantStage="flower"
        />
      </MemoryRouter>,
    );

    try {
      await waitFor(() => {
        expect(events).toEqual([
          expect.objectContaining({
            source: "quick_log_v2",
            growEventId: null,
            activityId: "photo",
          }),
        ]);
      });
    } finally {
      window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, handler);
    }
  });
});
