/**
 * Blueprint deep-link anchor.
 *
 * A cross-page link to a Plant Detail section cannot rely on the browser's
 * native `#hash` handling: the browser resolves it once, at load, and Plant
 * Detail's sections mount after their queries settle. The target does not
 * exist yet, so the grower silently lands at the top of a long page. That is
 * why AiDoctorReviewAnchorRestorer exists, and the Blueprint link needs the
 * same treatment.
 *
 * The failure mode being defended is a QUIET one — a drifted anchor string
 * still navigates, still renders, and just scrolls nowhere. So these assert
 * the id, the href, and the restorer agree with each other, rather than that
 * "a link exists".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import DeepLinkAnchorRestorer from "@/components/DeepLinkAnchorRestorer";
import {
  buildPlantBlueprintPath,
  PLANT_BLUEPRINT_ANCHOR_ID,
  PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID,
} from "@/lib/plantDetailQuickActions";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");
const DOCTOR_RESTORER = read("src/components/AiDoctorReviewAnchorRestorer.tsx");

/** Exact hash, parsed — `toContain` cannot tell `#x` from `#xs`. */
function hashOf(href: string | null): string {
  return new URL(href ?? "", "http://plant-detail.local").hash;
}

describe("buildPlantBlueprintPath", () => {
  it("targets the anchor the restorer listens for, exactly", () => {
    // Deliberately an equality check on the parsed hash. A substring assertion
    // passes for a drifted "#plant-blueprints", which navigates fine and
    // scrolls nowhere — the exact failure this anchor exists to prevent.
    expect(hashOf(buildPlantBlueprintPath("plant-1"))).toBe(`#${PLANT_BLUEPRINT_ANCHOR_ID}`);
  });

  it("returns null for a missing id rather than a half-built path", () => {
    expect(buildPlantBlueprintPath(null)).toBeNull();
    expect(buildPlantBlueprintPath(undefined)).toBeNull();
    expect(buildPlantBlueprintPath("   ")).toBeNull();
  });

  it("is a distinct destination from the AI Doctor review anchor", () => {
    expect(PLANT_BLUEPRINT_ANCHOR_ID).not.toBe(PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID);
    expect(buildPlantBlueprintPath("plant-1")).not.toContain(PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID);
  });
});

describe("DeepLinkAnchorRestorer", () => {
  const scrollIntoView = vi.fn();
  const focus = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    focus.mockClear();
    const el = document.createElement("section");
    el.id = PLANT_BLUEPRINT_ANCHOR_ID;
    el.scrollIntoView = scrollIntoView;
    el.focus = focus;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("re-applies the hash once the target has mounted", () => {
    render(
      <MemoryRouter initialEntries={[`/plants/plant-1#${PLANT_BLUEPRINT_ANCHOR_ID}`]}>
        <DeepLinkAnchorRestorer anchorId={PLANT_BLUEPRINT_ANCHOR_ID} />
      </MemoryRouter>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // Focus without stealing the scroll position it just set.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("fires for the href the shared helper actually builds", () => {
    // The integration that matters: helper output -> router -> restorer. If
    // either side drifts, the scroll never happens, and nothing else in the
    // suite would notice because the link still navigates and still renders.
    const href = buildPlantBlueprintPath("plant-1");
    expect(href).toBeTruthy();
    render(
      <MemoryRouter initialEntries={[href as string]}>
        <DeepLinkAnchorRestorer anchorId={PLANT_BLUEPRINT_ANCHOR_ID} />
      </MemoryRouter>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a different hash", () => {
    render(
      <MemoryRouter initialEntries={[`/plants/plant-1#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`]}>
        <DeepLinkAnchorRestorer anchorId={PLANT_BLUEPRINT_ANCHOR_ID} />
      </MemoryRouter>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when there is no hash at all", () => {
    render(
      <MemoryRouter initialEntries={["/plants/plant-1"]}>
        <DeepLinkAnchorRestorer anchorId={PLANT_BLUEPRINT_ANCHOR_ID} />
      </MemoryRouter>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("Plant Detail wiring", () => {
  it("renders the anchor id on a focusable section with scroll offset", () => {
    // scroll-mt-16 keeps the heading clear of the sticky header; tabIndex
    // makes the focus() call meaningful for keyboard users.
    expect(PLANT_DETAIL).toMatch(
      /id=\{PLANT_BLUEPRINT_ANCHOR_ID\}[\s\S]{0,200}tabIndex=\{-1\}[\s\S]{0,200}scroll-mt-16/,
    );
  });

  it("mounts a restorer for the Blueprint anchor", () => {
    expect(PLANT_DETAIL).toMatch(/<DeepLinkAnchorRestorer anchorId=\{PLANT_BLUEPRINT_ANCHOR_ID\}/);
  });

  it("wraps the Blueprint section itself, not an unrelated one", () => {
    expect(PLANT_DETAIL).toMatch(
      /id=\{PLANT_BLUEPRINT_ANCHOR_ID\}[\s\S]{0,400}<PlantBlueprintOverlaySection/,
    );
  });

  it("keeps the AI Doctor restorer working through the shared component", () => {
    // Refactored to delegate; its behaviour and public name must not change.
    expect(DOCTOR_RESTORER).toMatch(/DeepLinkAnchorRestorer/);
    expect(DOCTOR_RESTORER).toMatch(/anchorId=\{PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID\}/);
    expect(DOCTOR_RESTORER).toMatch(/export default function AiDoctorReviewAnchorRestorer/);
  });
});
