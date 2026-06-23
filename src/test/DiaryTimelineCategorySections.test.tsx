import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DiaryTimelineCategorySections } from "@/components/DiaryTimelineCategorySections";

interface FakeItem {
  id: string;
  eventType: string;
  source?: "note" | "photo" | "sensor";
  label: string;
}

function renderEntry(item: FakeItem) {
  return (
    <span data-testid={`fake-entry-${item.id}`} data-source={item.source ?? "note"}>
      {item.label}
    </span>
  );
}

const items: FakeItem[] = [
  { id: "w1", eventType: "watering", label: "Watered 500ml" },
  { id: "f1", eventType: "feeding", label: "Veg nutes A+B" },
  { id: "t1", eventType: "training", label: "LST top branch" },
  { id: "p1", eventType: "photo", source: "photo", label: "Canopy photo" },
  { id: "d1", eventType: "symptoms", label: "Yellowing tips" },
  { id: "h1", eventType: "harvest", label: "Harvest day 1" },
  { id: "o1", eventType: "note", label: "General note" },
];

describe("DiaryTimelineCategorySections — presenter", () => {
  it("renders all seven section headers with counts", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    const labels = [
      "Watering",
      "Feeding",
      "Training",
      "Photos",
      "Diagnoses",
      "Harvest results",
      "Other diary entries",
    ];
    for (const l of labels) {
      expect(
        screen.getByRole("button", { name: new RegExp(l, "i") }),
      ).toBeInTheDocument();
    }
    // counts: 1 each
    const countNodes = screen.getAllByTestId(
      "diary-timeline-category-sections-section-count",
    );
    expect(countNodes).toHaveLength(7);
    for (const n of countNodes) expect(n.textContent).toBe("1");
  });

  it("default-expands sections with entries and renders them via renderEntry", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    expect(screen.getByTestId("fake-entry-w1")).toBeInTheDocument();
    expect(screen.getByTestId("fake-entry-p1")).toBeInTheDocument();
    expect(screen.getByTestId("fake-entry-o1")).toBeInTheDocument();
  });

  it("collapsing a section flips aria-expanded and hides its items", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    const btn = screen.getByRole("button", { name: /Watering/i });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("fake-entry-w1")).not.toBeInTheDocument();
  });

  it("empty sections default-collapsed but header + empty copy reachable when expanded", () => {
    render(
      <DiaryTimelineCategorySections
        items={[items[0]] /* only watering */}
        renderEntry={renderEntry}
      />,
    );
    const trainingBtn = screen.getByRole("button", { name: /Training/i });
    expect(trainingBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trainingBtn);
    expect(
      screen.getByText("No training entries in the current timeline view."),
    ).toBeInTheDocument();
  });

  it("unknown event types render inside Other diary entries", () => {
    render(
      <DiaryTimelineCategorySections
        items={[{ id: "u1", eventType: "what-is-this", label: "mystery" }]}
        renderEntry={renderEntry}
      />,
    );
    const otherBtn = screen.getByRole("button", {
      name: /Other diary entries/i,
    });
    expect(otherBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("fake-entry-u1")).toBeInTheDocument();
  });

  it("does not drop entries — every input item rendered exactly once", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    for (const it of items) {
      const nodes = screen.getAllByTestId(`fake-entry-${it.id}`);
      expect(nodes).toHaveLength(1);
    }
  });

  it("preserves source/trust labels in caller's renderEntry output", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    const photoNode = screen.getByTestId("fake-entry-p1");
    expect(photoNode.getAttribute("data-source")).toBe("photo");
  });
});

// Static safety: the new component + rules must not import write/AI/automation paths.
describe("DiaryTimelineCategorySections — static safety", () => {
  const COMPONENT = readFileSync(
    resolve(process.cwd(), "src/components/DiaryTimelineCategorySections.tsx"),
    "utf8",
  );
  const RULES = readFileSync(
    resolve(process.cwd(), "src/lib/diaryTimelineSectionRules.ts"),
    "utf8",
  );

  // Forbidden in BOTH component + pure rules: writes, AI, automation.
  const forbidden = [
    /from\s+["']@\/integrations\/supabase\/client["']/,
    /\.functions\.invoke\(/,
    /\.from\(["'][a-z0-9_]+["']\)\s*\.\s*(insert|update|delete|upsert)\(/i,
    /openai|anthropic|gemini|claude/i,
    /ai-doctor|ai-coach/i,
    /action[_-]?queue.*\.(insert|update|delete|upsert)/i,
    /device[_-]?command|relay|actuator|auto[_-]?adjust/i,
    /service[_-]?role|SUPABASE_SERVICE_ROLE/i,
    /raw_payload/i,
  ];
  for (const f of forbidden) {
    it(`component contains no match for ${f}`, () => {
      expect(COMPONENT).not.toMatch(f);
    });
    it(`rules contain no match for ${f}`, () => {
      expect(RULES).not.toMatch(f);
    });
  }

  // Storage usage: pure rules must never touch storage; component MAY
  // use guarded getItem/setItem ONLY (no clear/removeItem of unrelated
  // keys).
  it("rules file never touches localStorage / sessionStorage at all", () => {
    expect(RULES).not.toMatch(/localStorage|sessionStorage/);
  });
  it("component only uses guarded localStorage.getItem / setItem", () => {
    expect(COMPONENT).not.toMatch(/sessionStorage/);
    expect(COMPONENT).not.toMatch(
      /localStorage\s*\.\s*(?:removeItem|clear)\(/,
    );
    // Reads + writes must go through try/catch helpers; check those exist.
    expect(COMPONENT).toMatch(/safeReadStorage/);
    expect(COMPONENT).toMatch(/safeWriteStorage/);
  });
});

// Lightweight wiring sanity: the presenter renders within a Card-like
// container without needing a Router. Acts as a regression for the
// Plant timeline integration shape.
describe("DiaryTimelineCategorySections — wrapper integration shape", () => {
  it("renders inside an arbitrary container with the expected aria region", () => {
    render(
      <div data-testid="outer">
        <DiaryTimelineCategorySections
          items={items}
          renderEntry={renderEntry}
          ariaLabel="Plant timeline category view"
        />
      </div>,
    );
    const outer = screen.getByTestId("outer");
    const region = within(outer).getByRole("region", {
      name: /Plant timeline category view/i,
    });
    expect(region).toBeInTheDocument();
  });
});

// --- Controls + saved state polish ---------------------------------------
describe("DiaryTimelineCategorySections — controls + saved state", () => {
  const STORAGE_KEY = "verdant:test:diary-category-sections:v1";

  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("renders Expand all / Collapse all / Reset sections controls + summary", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    expect(screen.getByRole("button", { name: /Expand all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collapse all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset sections/i })).toBeInTheDocument();
    const summary = screen.getByTestId(
      "diary-timeline-category-sections-summary",
    );
    expect(summary.getAttribute("data-total")).toBe(String(items.length));
    expect(summary.getAttribute("data-non-empty")).toBe("7");
    expect(summary.textContent).toMatch(/7 entries/);
    expect(summary.textContent).toMatch(/7 sections with entries/);
    expect(summary.textContent).toMatch(/1 in Other diary entries/);
  });

  it("Collapse all collapses every section, Expand all re-expands every section", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Collapse all/i }));
    for (const btn of screen.getAllByTestId(
      "diary-timeline-category-sections-section-toggle",
    )) {
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    }
    fireEvent.click(screen.getByRole("button", { name: /Expand all/i }));
    for (const btn of screen.getAllByTestId(
      "diary-timeline-category-sections-section-toggle",
    )) {
      expect(btn.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("Reset sections restores default expansion (non-empty open, empty closed)", () => {
    render(
      <DiaryTimelineCategorySections
        items={[items[0]] /* only watering */}
        renderEntry={renderEntry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Expand all/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reset sections/i }));
    expect(
      screen
        .getByRole("button", { name: /Watering/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /Training/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("persists toggles to localStorage when storageKey is provided", () => {
    render(
      <DiaryTimelineCategorySections
        items={items}
        renderEntry={renderEntry}
        storageKey={STORAGE_KEY}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Watering/i }));
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.watering).toBe(false);
    // Persisted blob never contains entry IDs / plant IDs / raw payload.
    expect(raw).not.toMatch(/w1|f1|plant|tent|user|raw_payload/i);
  });

  it("reads saved state from localStorage on mount", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ watering: false, photos: false }),
    );
    render(
      <DiaryTimelineCategorySections
        items={items}
        renderEntry={renderEntry}
        storageKey={STORAGE_KEY}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /Watering/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /Photos/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    // Sections not in saved state keep defaults (Feeding has entry → open).
    expect(
      screen
        .getByRole("button", { name: /Feeding/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("malformed localStorage value does not crash and falls back to defaults", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(() =>
      render(
        <DiaryTimelineCategorySections
          items={items}
          renderEntry={renderEntry}
          storageKey={STORAGE_KEY}
        />,
      ),
    ).not.toThrow();
    expect(
      screen
        .getByRole("button", { name: /Watering/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("unknown saved keys are ignored", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "totally-unknown": false, watering: false }),
    );
    render(
      <DiaryTimelineCategorySections
        items={items}
        renderEntry={renderEntry}
        storageKey={STORAGE_KEY}
      />,
    );
    // Known key applied; unknown ignored (no crash).
    expect(
      screen
        .getByRole("button", { name: /Watering/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});


describe("DiaryTimelineCategorySections — evidence-quality indicators", () => {
  it("renders an overall evidence summary line reflecting current sections", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    const node = screen.getByTestId(
      "diary-timeline-category-sections-evidence-summary",
    );
    // All seven sections have one entry in this fixture.
    expect(node.getAttribute("data-total-sections")).toBe("7");
    expect(node.getAttribute("data-present-count")).toBe("7");
    expect(node.getAttribute("data-missing-count")).toBe("0");
    expect(node.textContent).toMatch(/in this view/);
  });

  it("evidence summary tracks the filtered view (e.g. zero items → all missing)", () => {
    render(
      <DiaryTimelineCategorySections items={[]} renderEntry={renderEntry} />,
    );
    const node = screen.getByTestId(
      "diary-timeline-category-sections-evidence-summary",
    );
    expect(node.getAttribute("data-present-count")).toBe("0");
    expect(node.getAttribute("data-missing-count")).toBe("7");
    expect(node.textContent).toMatch(/0 of 7/);
    expect(node.textContent).toMatch(/in this view/);
  });

  it("each present section panel renders its own evidence-quality copy", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    const evidenceNodes = screen.getAllByTestId(
      "diary-timeline-category-sections-section-evidence",
    );
    // Default: non-empty sections are expanded, empty sections collapsed.
    // All seven have items in this fixture, so all seven render evidence.
    expect(evidenceNodes).toHaveLength(7);
    for (const n of evidenceNodes) {
      expect(n.getAttribute("data-evidence-status")).toBe("present");
      expect(n.textContent).toMatch(/in this view\.$/);
    }
  });

  it("empty section evidence reads 'missing' when expanded, and copy uses 'in this view'", () => {
    const onlyWatering: FakeItem[] = [
      { id: "w1", eventType: "watering", label: "Watered 500ml" },
    ];
    render(
      <DiaryTimelineCategorySections
        items={onlyWatering}
        renderEntry={renderEntry}
      />,
    );
    // Expand the empty Photos section to read its evidence copy.
    const photosToggle = screen.getByRole("button", { name: /Photos/i });
    fireEvent.click(photosToggle);
    const evidenceNodes = screen.getAllByTestId(
      "diary-timeline-category-sections-section-evidence",
    );
    const photoEvidence = evidenceNodes.find(
      (n) => n.getAttribute("data-section-id") === "photos",
    );
    expect(photoEvidence).toBeDefined();
    expect(photoEvidence!.getAttribute("data-evidence-status")).toBe("missing");
    expect(photoEvidence!.textContent).toBe(
      "No photo entries in this view.",
    );
  });

  it("evidence copy never uses diagnostic/aggressive/actionable wording", () => {
    render(
      <DiaryTimelineCategorySections items={items} renderEntry={renderEntry} />,
    );
    const banned =
      /\b(healthy|ideal|fix|urgent|auto|execute|control|actuate|relay|emergency|critical)\b/i;
    for (const n of screen.getAllByTestId(
      "diary-timeline-category-sections-section-evidence",
    )) {
      expect(n.textContent ?? "").not.toMatch(banned);
    }
    expect(
      screen.getByTestId("diary-timeline-category-sections-evidence-summary")
        .textContent ?? "",
    ).not.toMatch(banned);
  });
});
