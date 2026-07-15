/**
 * Public Quick Log Starter — anonymous render + draft lifecycle + link audit.
 *
 * Renders the page with NO auth provider mocked in (the surface must not
 * need one), drives the save → persist → clear lifecycle through the real
 * store (localStorage via test helpers only), and audits every internal
 * link against the route manifest's public entries — the same contract that
 * lets guides link here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuickLogStarter from "@/pages/QuickLogStarter";
import { APP_ROUTES } from "@/lib/appRouteManifest";
import { PUBLIC_QUICK_LOG_STARTER_COPY as COPY } from "@/constants/publicQuickLogStarterCopy";
import { PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY } from "@/lib/publicQuickLogStarterRules";
import { clearPublicQuickLogStarterDraft } from "@/lib/publicQuickLogStarterDraftStore";
import {
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "./helpers/localStorageTestHelper";

function renderStarter(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/quick-log${search}`]}>
      <QuickLogStarter />
    </MemoryRouter>,
  );
}

function saveMinimalDraft() {
  fireEvent.change(screen.getByTestId("starter-plant-nickname"), {
    target: { value: "Blue Dream #1" },
  });
  fireEvent.change(screen.getByTestId("starter-note"), {
    target: { value: "First true leaves look healthy." },
  });
  fireEvent.click(screen.getByTestId("starter-save-draft"));
}

beforeEach(() => {
  // setup.ts clears storage; reset the store's cached snapshot too.
  clearPublicQuickLogStarterDraft();
});

describe("anonymous render", () => {
  it("renders without any auth provider or app shell", () => {
    renderStarter();
    expect(screen.getByTestId("public-quick-log-starter")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: COPY.pageTitle })).toBeInTheDocument();
  });

  it("shows the truth line before any save", () => {
    renderStarter();
    expect(screen.getByTestId("starter-truth-line")).toHaveTextContent(COPY.truthLine);
  });

  it("renders the FAQ visibly (the JSON-LD mirror contract)", () => {
    renderStarter();
    const faq = screen.getByTestId("starter-faq");
    for (const entry of COPY.faq) {
      expect(within(faq).getByText(entry.question)).toBeInTheDocument();
      expect(within(faq).getByText(entry.answer)).toBeInTheDocument();
    }
  });
});

describe("draft lifecycle through the real store", () => {
  it("save persists the draft to the versioned key and shows the saved card", () => {
    renderStarter();
    expect(screen.queryByTestId("starter-saved-draft")).toBeNull();
    saveMinimalDraft();
    expect(screen.getByTestId("starter-saved-draft")).toBeInTheDocument();
    expect(screen.getByTestId("starter-saved-nickname")).toHaveTextContent("Blue Dream #1");
    const raw = getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({
      v: 1,
      plantNickname: "Blue Dream #1",
      logType: "observation",
      stage: "",
      wateringVolumeMl: null,
    });
  });

  it("captures allow-listed UTM attribution into the draft (never the URL junk)", () => {
    renderStarter("?utm_source=organic_guide&utm_medium=owned&ref=evil");
    saveMinimalDraft();
    const raw = getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
    expect(JSON.parse(raw!).attribution).toEqual({
      utm_source: "organic_guide",
      utm_medium: "owned",
    });
  });

  it("validation errors render inline and nothing persists", () => {
    renderStarter();
    fireEvent.click(screen.getByTestId("starter-save-draft"));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBeNull();
    expect(screen.queryByTestId("starter-saved-draft")).toBeNull();
  });

  it("watering requires a volume and stores it", () => {
    renderStarter();
    fireEvent.change(screen.getByTestId("starter-plant-nickname"), {
      target: { value: "Blue Dream #1" },
    });
    fireEvent.click(screen.getByTestId("starter-log-type-watering"));
    fireEvent.click(screen.getByTestId("starter-save-draft"));
    expect(screen.getByTestId("starter-watering-volume")).toBeInTheDocument();
    expect(getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBeNull();
    fireEvent.change(screen.getByTestId("starter-watering-volume"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByTestId("starter-save-draft"));
    const raw = getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY);
    expect(JSON.parse(raw!)).toMatchObject({ logType: "watering", wateringVolumeMl: 500 });
  });

  it("a stored draft renders on mount and Delete draft removes it", () => {
    setLocalStorageItemForTest(
      PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY,
      JSON.stringify({
        v: 1,
        id: "d-1",
        createdAt: "2026-07-15T10:00:00.000Z",
        updatedAt: "2026-07-15T10:00:00.000Z",
        plantNickname: "Stored Plant",
        stage: "flower",
        logType: "observation",
        note: "Stored note.",
        wateringVolumeMl: null,
        attribution: {},
      }),
    );
    renderStarter();
    expect(screen.getByTestId("starter-saved-nickname")).toHaveTextContent("Stored Plant");
    fireEvent.click(screen.getByTestId("starter-clear-draft"));
    expect(screen.queryByTestId("starter-saved-draft")).toBeNull();
    expect(getLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY)).toBeNull();
  });

  it("a corrupt stored draft degrades to the empty state without crashing", () => {
    setLocalStorageItemForTest(PUBLIC_QUICK_LOG_STARTER_DRAFT_KEY, "{corrupt!!");
    renderStarter();
    expect(screen.getByTestId("public-quick-log-starter")).toBeInTheDocument();
    expect(screen.queryByTestId("starter-saved-draft")).toBeNull();
  });
});

describe("storage-failure honesty", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a failed storage write shows the honest error instead of a saved card", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    renderStarter();
    saveMinimalDraft();
    expect(screen.getByTestId("starter-storage-error")).toHaveTextContent(COPY.storageErrorLine);
    expect(screen.queryByTestId("starter-saved-draft")).toBeNull();
  });
});

describe("outbound links", () => {
  it("signup CTA carries the pinned shape and inbound UTMs", () => {
    renderStarter("?utm_source=organic_guide&utm_medium=owned");
    const cta = screen.getByTestId("starter-signup-cta");
    expect(cta).toHaveAttribute(
      "href",
      "/auth?mode=signup&redirectTo=%2Fonboarding&utm_source=organic_guide&utm_medium=owned",
    );
  });

  it("every internal link resolves to a manifest route that is public", () => {
    renderStarter();
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      const href = a.getAttribute("href")!;
      if (!href.startsWith("/")) continue;
      const path = href.split("?")[0];
      const entry = APP_ROUTES.find((r) => r.path === path);
      expect(entry, `manifest entry for ${path}`).toBeDefined();
      expect(entry?.access, `${path} must be public`).toBe("public");
    }
  });
});
