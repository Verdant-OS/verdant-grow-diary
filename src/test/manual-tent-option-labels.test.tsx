/**
 * Manual tent chooser labels.
 *
 * Duplicate tent names must be distinguishable in the visible label and the
 * accessible name. Unique names stay exactly as stored. The option value
 * stays the tent id.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { manualTentOptionLabels, stableTentIdSuffix } from "@/lib/manualTentOptionLabelRules";

const NORTH = "11111111-1111-4111-8111-111111111111";
const SOUTH = "22222222-2222-4222-8222-222222222222";
const UNIQUE = "33333333-3333-4333-8333-333333333333";
const SAME_GROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const SAME_GROW_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const GROW_CAFE = "11111111-1111-4111-8111-11111111cafe";
const SUFFIX_CAFE = "22222222-2222-4222-8222-22222222cafe";
const GROW_NAMED_CAFE = "11111111-1111-4111-8111-111111111111";
const SUFFIX_ONLY_CAFE = "22222222-2222-4222-8222-22222222cafe";
const LITERAL_CAFE = "44444444-4444-4444-8444-444444444444";

function renderCard(tents: { id: string; name: string; growName?: string | null }[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ManualSensorReadingCard tents={tents} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("manualTentOptionLabels", () => {
  it("returns a unique name unchanged, including when a grow name is available", () => {
    const labels = manualTentOptionLabels([{ id: UNIQUE, name: "Tent A", growName: "North Room" }]);
    expect(labels.get(UNIQUE)).toBe("Tent A");
  });

  it("uses the grow name when duplicate names have different grows", () => {
    const labels = manualTentOptionLabels([
      { id: NORTH, name: "Flower", growName: "North Room" },
      { id: SOUTH, name: "Flower", growName: "South Room" },
    ]);
    expect(labels.get(NORTH)).toBe("Flower · North Room");
    expect(labels.get(SOUTH)).toBe("Flower · South Room");
    expect(labels.get(NORTH)).not.toBe(labels.get(SOUTH));
  });

  it("uses a stable id suffix when there is no better distinguishing detail", () => {
    const peers = [SAME_GROW_A, SAME_GROW_B, NORTH];
    const input = [
      { id: SAME_GROW_A, name: "Flower", growName: "Shared" },
      { id: SAME_GROW_B, name: "Flower", growName: "Shared" },
      { id: NORTH, name: "Flower" },
    ];
    const labels = manualTentOptionLabels(input);
    expect(labels.get(SAME_GROW_A)).toBe(`Flower · ${stableTentIdSuffix(SAME_GROW_A, peers)}`);
    expect(labels.get(SAME_GROW_B)).toBe(`Flower · ${stableTentIdSuffix(SAME_GROW_B, peers)}`);
    expect(labels.get(NORTH)).toBe(`Flower · ${stableTentIdSuffix(NORTH, peers)}`);
    expect(new Set(labels.values()).size).toBe(3);
    expect(labels.get(SAME_GROW_A)).not.toContain("Shared");
    expect(manualTentOptionLabels(input)).toEqual(labels);
  });

  it("does not let a grow-name label collide with an id-suffix label", () => {
    const input = [
      { id: GROW_NAMED_CAFE, name: "Flower", growName: "cafe" },
      { id: SUFFIX_ONLY_CAFE, name: "Flower" },
    ];
    const labels = manualTentOptionLabels(input);
    expect(labels.get(GROW_NAMED_CAFE)).not.toBe(labels.get(SUFFIX_ONLY_CAFE));
    expect(new Set(labels.values()).size).toBe(2);
    expect([...labels.keys()].sort()).toEqual([GROW_NAMED_CAFE, SUFFIX_ONLY_CAFE].sort());
    expect(manualTentOptionLabels(input)).toEqual(labels);
  });

  it("keeps a unique tent name when it matches another option's disambiguated label", () => {
    const input = [
      { id: LITERAL_CAFE, name: "Flower · cafe" },
      { id: GROW_NAMED_CAFE, name: "Flower", growName: "cafe" },
      { id: SUFFIX_ONLY_CAFE, name: "Flower" },
    ];
    const labels = manualTentOptionLabels(input);
    expect(labels.get(LITERAL_CAFE)).toBe("Flower · cafe");
    expect(labels.get(GROW_NAMED_CAFE)).not.toBe("Flower · cafe");
    expect(labels.get(SUFFIX_ONLY_CAFE)).not.toBe("Flower · cafe");
    expect(new Set(labels.values()).size).toBe(3);
    expect(manualTentOptionLabels(input)).toEqual(labels);
  });

  it("keeps id-suffix labels unique when two ids share a short tail", () => {
    const peers = [GROW_CAFE, SUFFIX_CAFE];
    const input = [
      { id: GROW_CAFE, name: "Flower" },
      { id: SUFFIX_CAFE, name: "Flower" },
    ];
    const labels = manualTentOptionLabels(input);
    expect(labels.get(GROW_CAFE)).toBe(`Flower · ${stableTentIdSuffix(GROW_CAFE, peers)}`);
    expect(labels.get(SUFFIX_CAFE)).toBe(`Flower · ${stableTentIdSuffix(SUFFIX_CAFE, peers)}`);
    expect(labels.get(GROW_CAFE)).not.toBe(labels.get(SUFFIX_CAFE));
    expect(manualTentOptionLabels(input)).toEqual(labels);
  });
});

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.setPointerCapture = () => {};
});

async function openTentOptions() {
  fireEvent.keyDown(screen.getByTestId("manual-reading-tent-select"), { key: "ArrowDown" });
}

describe("ManualSensorReadingCard tent chooser", () => {
  it("renders distinct labels and accessible names for duplicate tent names", async () => {
    renderCard([
      { id: NORTH, name: "Flower", growName: "North Room" },
      { id: SOUTH, name: "Flower", growName: "South Room" },
    ]);

    expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent(
      "Saving to: Flower · North Room",
    );
    expect(screen.getByTestId("manual-reading-tent-select")).toHaveTextContent(
      "Flower · North Room",
    );

    await openTentOptions();
    const north = await screen.findByTestId(`manual-reading-tent-option-${NORTH}`);
    const south = await screen.findByTestId(`manual-reading-tent-option-${SOUTH}`);
    expect(north).toHaveTextContent("Flower · North Room");
    expect(south).toHaveTextContent("Flower · South Room");
    expect(north).toHaveAttribute("aria-label", "Flower · North Room");
    expect(south).toHaveAttribute("aria-label", "Flower · South Room");
    expect(north).toHaveAccessibleName("Flower · North Room");
    expect(south).toHaveAccessibleName("Flower · South Room");
  });

  it("keeps unique names plain in the label and the accessible name", async () => {
    renderCard([
      { id: UNIQUE, name: "Tent A", growName: "North Room" },
      { id: NORTH, name: "Veg" },
    ]);

    expect(screen.getByTestId("manual-reading-tent-row")).toHaveTextContent("Saving to: Tent A");
    expect(screen.getByTestId("manual-reading-tent-row").textContent ?? "").not.toMatch(
      /North Room/,
    );
    expect(screen.getByTestId("manual-reading-tent-select")).toHaveTextContent("Tent A");

    await openTentOptions();
    const unique = await screen.findByTestId(`manual-reading-tent-option-${UNIQUE}`);
    const veg = await screen.findByTestId(`manual-reading-tent-option-${NORTH}`);
    expect(unique).toHaveTextContent("Tent A");
    expect(unique.textContent ?? "").not.toMatch(/North Room|·/);
    expect(veg).toHaveTextContent("Veg");
    expect(unique).toHaveAccessibleName("Tent A");
    expect(veg).toHaveAccessibleName("Veg");
  });

  it("distinguishes duplicate names with a stable suffix when grow names do not help", async () => {
    renderCard([
      { id: SAME_GROW_A, name: "Flower" },
      { id: SAME_GROW_B, name: "Flower" },
    ]);
    await openTentOptions();
    const first = await screen.findByTestId(`manual-reading-tent-option-${SAME_GROW_A}`);
    const second = await screen.findByTestId(`manual-reading-tent-option-${SAME_GROW_B}`);
    expect(first.textContent).not.toBe(second.textContent);
    expect(first).toHaveAccessibleName(String(first.textContent));
    expect(second).toHaveAccessibleName(String(second.textContent));
    expect(first.textContent ?? "").toContain("Flower ·");
    expect(second.textContent ?? "").toContain("Flower ·");
  });

  it("gives a grow-name label and an id-suffix label different accessible names", async () => {
    renderCard([
      { id: GROW_NAMED_CAFE, name: "Flower", growName: "cafe" },
      { id: SUFFIX_ONLY_CAFE, name: "Flower" },
    ]);
    await openTentOptions();
    const grow = await screen.findByTestId(`manual-reading-tent-option-${GROW_NAMED_CAFE}`);
    const suffix = await screen.findByTestId(`manual-reading-tent-option-${SUFFIX_ONLY_CAFE}`);
    expect(grow.textContent).not.toBe(suffix.textContent);
    expect(grow).toHaveAccessibleName(String(grow.textContent));
    expect(suffix).toHaveAccessibleName(String(suffix.textContent));
  });
});
