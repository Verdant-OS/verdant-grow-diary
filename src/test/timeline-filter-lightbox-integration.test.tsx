/**
 * Timeline filter + lightbox integration coverage.
 *
 * Uses a small harness component that mirrors the exact wiring used in
 * src/pages/Timeline.tsx:
 *   - filterTimelineEvidenceRows -> filtered rows
 *   - buildTimelinePhotoLightboxList(filtered) -> nav list
 *   - lightboxIndex state + auto-close effect when active falls out of range
 *   - <li id="timeline-entry-<id>"> anchors (Quick Log "View in Timeline")
 *   - Clear filters / results count
 *
 * Read-only. No DB / fetch / AI / device / Action Queue / alert / sensor
 * writes. No fake live data. No new features beyond integration polish.
 */
import { describe, it, expect } from "vitest";
import React, { useEffect, useMemo, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  filterTimelineEvidenceRows,
  isTimelineEvidenceFilterActive,
} from "@/lib/timelineEvidenceFilterRules";
import {
  buildTimelinePhotoAltText,
  buildTimelinePhotoLightboxList,
  findTimelinePhotoIndexById,
} from "@/lib/timelinePhotoLightboxRules";
import TimelinePhotoLightbox from "@/components/TimelinePhotoLightbox";

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
  { id: "e1", note: "Watered today",      photo_url: "https://x/1.jpg", stage: "veg",    plant_id: "p1", tent_id: "t1", details: { event_type: "watering", plant_name: "Blue Dream" },     entry_at: "2025-01-01T00:00:00Z" },
  { id: "e2", note: "No photo entry",     photo_url: null,              stage: "veg",    plant_id: "p1", tent_id: "t1", details: { event_type: "note",     plant_name: "Blue Dream" },     entry_at: "2025-01-02T00:00:00Z" },
  { id: "e3", note: "Yellow leaf photo",  photo_url: "https://x/3.jpg", stage: "flower", plant_id: "p2", tent_id: "t1", details: { event_type: "photo",    plant_name: "Northern Lights" },entry_at: "2025-01-03T00:00:00Z" },
  { id: "e4", note: "Fed nutrients",      photo_url: "https://x/4.jpg", stage: "flower", plant_id: "p2", tent_id: "t1", details: { event_type: "feeding",  plant_name: "Northern Lights" },entry_at: "2025-01-04T00:00:00Z" },
];

function Harness() {
  const [query, setQuery] = useState("");
  const [plantId, setPlantId] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const filtered = useMemo(
    () => filterTimelineEvidenceRows(ROWS, { query, plantId, tentId: "", eventType: "" }),
    [query, plantId],
  );
  const lightboxItems = useMemo(
    () => buildTimelinePhotoLightboxList(filtered),
    [filtered],
  );
  useEffect(() => {
    if (lightboxIndex === null) return;
    if (lightboxIndex < 0 || lightboxIndex >= lightboxItems.length) {
      setLightboxIndex(null);
    }
  }, [lightboxItems, lightboxIndex]);

  const active = isTimelineEvidenceFilterActive({ query, plantId, tentId: "", eventType: "" });

  function clear() {
    setQuery("");
    setPlantId("");
  }

  return (
    <div>
      <input
        data-testid="q"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="search"
      />
      <select
        data-testid="plant"
        value={plantId}
        onChange={(e) => setPlantId(e.target.value)}
        aria-label="plant"
      >
        <option value="">All</option>
        <option value="p1">p1</option>
        <option value="p2">p2</option>
      </select>
      <button
        type="button"
        data-testid="clear"
        onClick={clear}
        disabled={!active}
      >
        Clear filters
      </button>
      <p data-testid="count">
        Showing {filtered.length} of {ROWS.length}
      </p>
      <ul>
        {filtered.map((e) => (
          <li
            key={e.id}
            id={`timeline-entry-${e.id}`}
            data-testid="timeline-entry"
          >
            {e.photo_url ? (
              (() => {
                const idx = findTimelinePhotoIndexById(lightboxItems, e.id);
                const item = idx >= 0 ? lightboxItems[idx] : null;
                const alt = buildTimelinePhotoAltText(item);
                return (
                  <button
                    type="button"
                    data-testid={`open-${e.id}`}
                    onClick={() => idx >= 0 && setLightboxIndex(idx)}
                    aria-label={`Open photo: ${alt}`}
                  >
                    photo
                  </button>
                );
              })()
            ) : (
              <span data-testid={`no-photo-${e.id}`}>no photo</span>
            )}
          </li>
        ))}
      </ul>
      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <TimelinePhotoLightbox
          items={lightboxItems}
          activeIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}

describe("Timeline filter + lightbox integration", () => {
  it("renders Quick Log #timeline-entry-<id> anchors on each visible entry", () => {
    render(<Harness />);
    const anchors = document.querySelectorAll("[id^='timeline-entry-']");
    expect(anchors.length).toBe(ROWS.length);
    expect(document.getElementById("timeline-entry-e1")).toBeTruthy();
    expect(document.getElementById("timeline-entry-e3")).toBeTruthy();
  });

  it("results count updates with filters and Clear restores everything", () => {
    render(<Harness />);
    expect(screen.getByTestId("count").textContent).toContain("Showing 4 of 4");
    fireEvent.change(screen.getByTestId("plant"), { target: { value: "p2" } });
    expect(screen.getByTestId("count").textContent).toContain("Showing 2 of 4");
    fireEvent.click(screen.getByTestId("clear"));
    expect(screen.getByTestId("count").textContent).toContain("Showing 4 of 4");
  });

  it("Clear filters is disabled when no filter is active", () => {
    render(<Harness />);
    expect((screen.getByTestId("clear") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("q"), { target: { value: "yellow" } });
    expect((screen.getByTestId("clear") as HTMLButtonElement).disabled).toBe(false);
  });

  it("no-photo entries are absent from lightbox navigation", () => {
    render(<Harness />);
    expect(screen.getByTestId("no-photo-e2")).toBeTruthy();
    expect(screen.queryByTestId("open-e2")).toBeNull();
    fireEvent.click(screen.getByTestId("open-e1"));
    // 3 photo rows total -> "1 of 3"
    expect(screen.getByTestId("timeline-photo-lightbox-counter").textContent).toBe("1 of 3");
  });

  it("opening a photo then applying a filter that hides it auto-closes the lightbox", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("open-e1"));
    expect(screen.getByTestId("timeline-photo-lightbox")).toBeTruthy();
    // Filter to plant p2 -> e1 (p1) is hidden, list shrinks to [e3, e4]
    fireEvent.change(screen.getByTestId("plant"), { target: { value: "p2" } });
    expect(screen.queryByTestId("timeline-photo-lightbox")).toBeNull();
  });

  it("after filtering, lightbox navigates only through filtered photos", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("plant"), { target: { value: "p2" } });
    fireEvent.click(screen.getByTestId("open-e3"));
    const counter = screen.getByTestId("timeline-photo-lightbox-counter");
    expect(counter.textContent).toBe("1 of 2");
    // Prev hidden at start, Next available
    expect(screen.queryByTestId("timeline-photo-lightbox-prev")).toBeNull();
    fireEvent.click(screen.getByTestId("timeline-photo-lightbox-next"));
    expect(counter.textContent).toBe("2 of 2");
    expect(screen.queryByTestId("timeline-photo-lightbox-next")).toBeNull();
    // Going further is a no-op (no wrap)
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(counter.textContent).toBe("2 of 2");
  });

  it("Clear filters restores full photo navigation list", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("plant"), { target: { value: "p2" } });
    fireEvent.click(screen.getByTestId("open-e3"));
    expect(screen.getByTestId("timeline-photo-lightbox-counter").textContent).toBe("1 of 2");
    fireEvent.click(screen.getByTestId("timeline-photo-lightbox-close"));
    fireEvent.click(screen.getByTestId("clear"));
    fireEvent.click(screen.getByTestId("open-e1"));
    expect(screen.getByTestId("timeline-photo-lightbox-counter").textContent).toBe("1 of 3");
  });

  it("empty filter state neutralizes lightbox: no photo buttons, no controls", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("q"), { target: { value: "zzzzz-no-match" } });
    expect(screen.queryAllByTestId("timeline-entry").length).toBe(0);
    expect(screen.queryByTestId("timeline-photo-lightbox")).toBeNull();
  });

  it("Quick Log anchors are not removed by the filter/search UI for visible entries", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("q"), { target: { value: "yellow" } });
    // Only e3 matches by note text
    expect(screen.queryAllByTestId("timeline-entry").length).toBe(1);
    expect(document.getElementById("timeline-entry-e3")).toBeTruthy();
    fireEvent.click(screen.getByTestId("clear"));
    expect(document.getElementById("timeline-entry-e1")).toBeTruthy();
    expect(document.getElementById("timeline-entry-e4")).toBeTruthy();
  });

  it("photo buttons expose accessible labels describing the photo", () => {
    render(<Harness />);
    const btn = screen.getByTestId("open-e1");
    const label = btn.getAttribute("aria-label") || "";
    expect(label).toContain("Open photo");
    expect(label).toContain("Blue Dream");
    expect(label).toContain("2025-01-01T00:00:00Z");
  });
});

describe("Timeline page source — anchor + label + leak guards", () => {
  const TIMELINE = readFileSync(join(process.cwd(), "src/pages/Timeline.tsx"), "utf8");

  it("renders id=\"timeline-entry-<id>\" on each entry <li>", () => {
    expect(TIMELINE).toMatch(/id=\{`timeline-entry-\$\{e\.id\}`\}/);
  });

  it("photo button uses accessible Open photo label", () => {
    expect(TIMELINE).toMatch(/aria-label=\{`Open photo:/);
  });

  it("Clear filters is disabled when no filter is active", () => {
    expect(TIMELINE).toMatch(/disabled=\{!evidenceActive\}/);
  });

  it("results count is rendered with aria-live", () => {
    expect(TIMELINE).toMatch(/data-testid="timeline-results-count"[\s\S]*aria-live="polite"/);
  });

  const LEAKS = [
    /\braw_payload\b/,
    /PASSKEY/,
    /\bAuthorization\s*:/,
    /Bearer\s+[A-Za-z0-9]/,
    /service[_-]?role/i,
    /\bvbt_[A-Za-z0-9]/,
    /bridge[_-]?token/i,
    /sensor-ingest-webhook/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  ];
  it("does not leak secrets / tokens / ingest URLs / JWTs in render path", () => {
    for (const re of LEAKS) expect(TIMELINE, `matched ${re}`).not.toMatch(re);
  });

  it("filter/lightbox slice introduces no writes / AI / device side effects", () => {
    // Existing Timeline.tsx already has reads via supabase.from(...). We
    // scope this guard to patterns the filter/lightbox slice must not add.
    expect(TIMELINE).not.toMatch(/\.insert\(/);
    expect(TIMELINE).not.toMatch(/\.update\(/);
    expect(TIMELINE).not.toMatch(/\.delete\(/);
    expect(TIMELINE).not.toMatch(/\.upsert\(/);
    expect(TIMELINE).not.toMatch(/\.rpc\(/);
    expect(TIMELINE).not.toMatch(/functions\s*\.\s*invoke\s*\(/);
    expect(TIMELINE).not.toMatch(/\bai-doctor-review\b/);
    expect(TIMELINE).not.toMatch(/\bai-coach\b/);
    expect(TIMELINE).not.toMatch(/sensor_readings/);
    expect(TIMELINE).not.toMatch(/action_queue\b(?!_events)/); // events read-only join allowed
    expect(TIMELINE).not.toMatch(/\b(turn|activate)\b.*\b(fan|light|pump|heater|humidifier|dehumidifier)\b/i);
    expect(TIMELINE).not.toMatch(/method:\s*["']POST["']/);
  });
});
