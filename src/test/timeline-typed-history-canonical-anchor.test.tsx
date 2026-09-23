import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WateringHistoryPanel from "@/components/WateringHistoryPanel";
import FeedingHistoryPanel from "@/components/FeedingHistoryPanel";
import { mapGrowEventsToRecentRawEntries } from "@/lib/growEventToDiaryRawEntry";
import { useTimelineHashAnchorHandoff } from "@/hooks/useTimelineHashAnchorHandoff";

// Network-only boundary: the real panels, normalizers and navigation hook run.
vi.mock("@/hooks/useQuickLogRevisionBadges", () => ({
  useQuickLogRevisionBadges: () => ({ badges: new Map(), status: "unavailable" }),
  QUICK_LOG_REVISION_BADGES_UNAVAILABLE_NOTE: "Revision history unavailable",
}));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function History({
  kind,
  companion,
  typed = true,
}: {
  kind: "watering" | "feeding";
  companion: boolean;
  typed?: boolean;
}) {
  const Panel = kind === "watering" ? WateringHistoryPanel : FeedingHistoryPanel;
  useTimelineHashAnchorHandoff("#timeline-entry-event-1", true, { prefersReducedMotion: true });
  const rawEntries = mapGrowEventsToRecentRawEntries([
    {
      id: "event-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      event_type: kind,
      source: "manual",
      occurred_at: "2026-09-23T12:00:00Z",
      note: "Original saved care",
      is_deleted: false,
      watering_events: kind === "watering" ? [{ volume_ml: 750 }] : [],
      feeding_events: kind === "feeding" ? [{ volume_ml: 750, ph: 6.2 }] : [],
    },
  ]);
  return (
    <>
      {typed && (
        <Panel
          rawEntries={rawEntries}
          reservedTimelineAnchorIds={
            new Set(companion ? ["timeline-entry-event-1", "timeline-entry-diary-1"] : [])
          }
        />
      )}
      {companion && (
        <ul>
          <li id="timeline-entry-diary-1" data-testid="diary-evidence">
            <span
              id="timeline-entry-event-1"
              data-timeline-entry-alias-for="timeline-entry-diary-1"
              hidden
            />
            Original saved care · Source: manual
          </li>
        </ul>
      )}
    </>
  );
}

function mount(kind: "watering" | "feeding", companion: boolean, typed = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <History kind={kind} companion={companion} typed={typed} />
    </QueryClientProvider>,
  );
}

it.each(["watering", "feeding"] as const)(
  "%s has one fragment target and focuses the diary evidence when both representations exist",
  (kind) => {
    mount(kind, true);
    expect(document.querySelectorAll('[id="timeline-entry-event-1"]')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByTestId("diary-evidence"));
    expect(screen.getByTestId("diary-evidence")).toHaveTextContent("Source: manual");
    expect(within(screen.getByTestId(`${kind}-history-panel`)).getByText(/750/)).toBeVisible();
  },
);

it.each(["watering", "feeding"] as const)(
  "%s keeps a navigable typed card when the companion is outside the rendered diary page/filter",
  (kind) => {
    mount(kind, false);
    const target = document.getElementById("timeline-entry-event-1");
    expect(target).not.toBeNull();
    expect(document.querySelectorAll('[id="timeline-entry-event-1"]')).toHaveLength(1);
    expect(document.activeElement).toBe(target);
    expect(target).toHaveTextContent("750");
  },
);

it.each(["watering", "feeding"] as const)(
  "%s keeps companion navigation when the typed row is outside its read window",
  (kind) => {
    mount(kind, true, false);
    expect(document.querySelectorAll('[id="timeline-entry-event-1"]')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByTestId("diary-evidence"));
  },
);
