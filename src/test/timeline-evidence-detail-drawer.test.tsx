/**
 * Integration: a small harness mirrors Timeline's drawer + lightbox
 * wiring to prove:
 *  - Clicking entry body opens the evidence drawer.
 *  - Clicking the photo button opens the lightbox, NOT the drawer.
 *  - Closing the drawer does not clear search/plant filters.
 *  - Quick Log #timeline-entry-<id> anchors remain present.
 */
import { describe, it, expect } from "vitest";
import React, { useMemo, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  filterTimelineEvidenceRows,
} from "@/lib/timelineEvidenceFilterRules";
import {
  buildTimelinePhotoLightboxList,
  findTimelinePhotoIndexById,
} from "@/lib/timelinePhotoLightboxRules";
import { buildTimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";
import TimelinePhotoLightbox from "@/components/TimelinePhotoLightbox";
import TimelineEvidenceDetailDrawer from "@/components/TimelineEvidenceDetailDrawer";

type Row = {
  id: string;
  note: string;
  photo_url: string | null;
  stage: string | null;
  plant_id: string | null;
  tent_id: string | null;
  details: Record<string, unknown>;
  entry_at: string;
};

const ROWS: Row[] = [
  { id: "e1", note: "Watered today", photo_url: "https://x/1.jpg", stage: "veg", plant_id: "p1", tent_id: "t1", details: { event_type: "watering", plant_name: "Blue Dream" }, entry_at: "2025-01-01T00:00:00Z" },
  { id: "e2", note: "No photo entry", photo_url: null, stage: "veg", plant_id: "p1", tent_id: "t1", details: { event_type: "note", plant_name: "Blue Dream" }, entry_at: "2025-01-02T00:00:00Z" },
  {
    id: "e3",
    note: "Maturity check",
    photo_url: null,
    stage: "flower",
    plant_id: "p1",
    tent_id: "t1",
    details: {
      event_type: "note",
      plant_name: "Blue Dream",
      maturity_evidence: {
        source: "manual",
        evidence_type: "quick_log_maturity_evidence",
        advisory_only: true,
        observed_at: "2025-01-03T00:00:00Z",
        cloudy_pct: 70,
        amber_pct: 20,
        color_note: "mostly turned",
        grower_note: "watch again tomorrow",
      },
    },
    entry_at: "2025-01-03T00:00:00Z",
  },
];

function Harness() {
  const [query, setQuery] = useState("");
  const [plantId, setPlantId] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterTimelineEvidenceRows(ROWS, { query, plantId, tentId: "", eventType: "" }),
    [query, plantId],
  );
  const lightboxItems = useMemo(() => buildTimelinePhotoLightboxList(filtered), [filtered]);
  const lightboxIndex = findTimelinePhotoIndexById(lightboxItems, photoId);
  const detailRow = ROWS.find((r) => r.id === detailId) ?? null;
  const detailVm = detailRow ? buildTimelineEvidenceDetailViewModel(detailRow) : null;

  return (
    <div>
      <input data-testid="q" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="search" />
      <select data-testid="plant" value={plantId} onChange={(e) => setPlantId(e.target.value)} aria-label="plant">
        <option value="">All</option>
        <option value="p1">p1</option>
        <option value="p2">p2</option>
      </select>
      <ul>
        {filtered.map((e) => (
          <li key={e.id} id={`timeline-entry-${e.id}`} data-testid="timeline-entry">
            {e.photo_url ? (
              <button
                type="button"
                data-testid={`open-photo-${e.id}`}
                onClick={(ev) => { ev.stopPropagation(); setPhotoId(e.id); }}
                aria-label="Open photo"
              >
                photo
              </button>
            ) : null}
            <div
              data-testid={`entry-body-${e.id}`}
              role="button"
              tabIndex={0}
              onClick={() => setDetailId(e.id)}
            >
              body
            </div>
          </li>
        ))}
      </ul>
      {lightboxIndex >= 0 && lightboxItems.length > 0 && (
        <TimelinePhotoLightbox
          items={lightboxItems}
          activeIndex={lightboxIndex}
          onClose={() => setPhotoId(null)}
          onNavigate={(i) => setPhotoId(lightboxItems[i]?.id ?? null)}
        />
      )}
      <TimelineEvidenceDetailDrawer
        open={!!detailId}
        viewModel={detailVm}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

describe("Timeline evidence drawer integration", () => {
  it("clicking the entry body opens the drawer", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("entry-body-e1"));
    expect(screen.getByTestId("timeline-evidence-drawer")).toBeTruthy();
    expect(screen.getByTestId("timeline-evidence-drawer-title").textContent).toBe("Blue Dream");
  });

  it("clicking the photo button opens the lightbox, NOT the drawer", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("open-photo-e1"));
    expect(screen.getByTestId("timeline-photo-lightbox")).toBeTruthy();
    expect(screen.queryByTestId("timeline-evidence-drawer")).toBeNull();
  });

  it("drawer surfaces a non-executing AI Doctor context hint", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("entry-body-e2"));
    const ctx = screen.getByTestId("timeline-evidence-drawer-context");
    expect(ctx.textContent).toContain("Missing photo/sensor context");
  });

  it("drawer surfaces maturity evidence without making a decision", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("entry-body-e3"));
    const section = screen.getByTestId("timeline-maturity-evidence");
    expect(section.textContent).toContain("Cloudy 70%");
    expect(section.textContent).toContain("Amber 20%");
    expect(section.textContent).toContain("Color");
    expect(section.textContent).toContain("mostly turned");
    expect(section.textContent).toContain("Evidence only — grower decides");
    expect(section.textContent).not.toMatch(/ready to harvest/i);
    expect(section.textContent).not.toMatch(/harvest now/i);
  });

  it("closing the drawer preserves search + filters", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("q"), { target: { value: "Watered" } });
    fireEvent.change(screen.getByTestId("plant"), { target: { value: "p1" } });
    fireEvent.click(screen.getByTestId("entry-body-e1"));
    fireEvent.click(screen.getByTestId("timeline-evidence-drawer-close"));
    expect(screen.queryByTestId("timeline-evidence-drawer")).toBeNull();
    expect((screen.getByTestId("q") as HTMLInputElement).value).toBe("Watered");
    expect((screen.getByTestId("plant") as HTMLSelectElement).value).toBe("p1");
  });

  it("Quick Log #timeline-entry-<id> anchors remain present alongside drawer wiring", () => {
    render(<Harness />);
    expect(document.getElementById("timeline-entry-e1")).toBeTruthy();
    expect(document.getElementById("timeline-entry-e2")).toBeTruthy();
  });

  it("Escape key closes the drawer", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("entry-body-e1"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("timeline-evidence-drawer")).toBeNull();
  });
});
