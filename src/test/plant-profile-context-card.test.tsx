import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import PlantProfileContextCard from "@/components/PlantProfileContextCard";
import { buildPlantProfileMetadataPayload } from "@/lib/plantProfileMetadataUpdate";

describe("PlantProfileContextCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders known stage and strain", () => {
    render(<PlantProfileContextCard stage="Veg" strain="Blue Dream" />);
    expect(screen.getByText("Stage: Veg")).toBeInTheDocument();
    expect(screen.getByText("Strain: Blue Dream")).toBeInTheDocument();
  });

  it("renders missing medium and pot size copy", () => {
    render(<PlantProfileContextCard stage="Veg" />);
    expect(
      screen.getByText("Medium is not available on this plant profile yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pot size is not available on this plant profile yet."),
    ).toBeInTheDocument();
  });

  it("renders disabled coming-soon controls when no onSave is provided", () => {
    render(<PlantProfileContextCard />);
    const addMedium = screen.getByTestId("plant-profile-context-add-medium");
    const addPot = screen.getByTestId("plant-profile-context-add-pot-size");
    expect(addMedium).toBeDisabled();
    expect(addMedium).toHaveTextContent(/coming soon/i);
    expect(addPot).toBeDisabled();
    expect(addPot).toHaveTextContent(/coming soon/i);
  });

  it("does not call fetch / storage on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
      throw new Error("fetch should not be called");
    }) as never);
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    render(<PlantProfileContextCard stage="Veg" strain="X" />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
  });

  it("renders known medium and pot size when provided", () => {
    render(
      <PlantProfileContextCard
        stage="Flower"
        strain="BD"
        medium="coco"
        potSize="11 L"
      />,
    );
    expect(screen.getByText("Medium: coco")).toBeInTheDocument();
    expect(screen.getByText("Pot size: 11 L")).toBeInTheDocument();
  });

  it("does not infer medium/pot size from strain or freeform values", () => {
    render(
      <PlantProfileContextCard
        stage="Flower"
        strain="Coco 5gal organic super soil"
      />,
    );
    expect(
      screen.getByTestId("plant-profile-context-field-medium").getAttribute("data-known"),
    ).toBe("false");
    expect(
      screen.getByTestId("plant-profile-context-field-pot-size").getAttribute("data-known"),
    ).toBe("false");
  });
});

describe("PlantProfileContextCard inline edit", () => {
  it("opens inline edit mode when onSave is provided", () => {
    render(<PlantProfileContextCard onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId("plant-profile-context-add-medium"));
    expect(screen.getByTestId("plant-profile-context-edit-form")).toBeInTheDocument();
    expect(screen.getByTestId("plant-profile-context-input-medium")).toBeInTheDocument();
    expect(screen.getByTestId("plant-profile-context-input-pot-size")).toBeInTheDocument();
  });

  it("saves medium and pot size with allow-listed payload only", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PlantProfileContextCard medium="coco" potSize="11 L" onSave={onSave} />);
    fireEvent.click(screen.getByTestId("plant-profile-context-add-medium"));
    fireEvent.change(screen.getByTestId("plant-profile-context-input-medium"), {
      target: { value: "soil" },
    });
    fireEvent.change(screen.getByTestId("plant-profile-context-input-pot-size"), {
      target: { value: "15 L" },
    });
    fireEvent.click(screen.getByTestId("plant-profile-context-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const draft = onSave.mock.calls[0][0];
    expect(Object.keys(draft).sort()).toEqual(["medium", "potSize"]);
    expect(draft).toEqual({ medium: "soil", potSize: "15 L" });
  });

  it("cancel restores previous display state without calling onSave", () => {
    const onSave = vi.fn();
    render(<PlantProfileContextCard medium="coco" onSave={onSave} />);
    fireEvent.click(screen.getByTestId("plant-profile-context-add-medium"));
    fireEvent.change(screen.getByTestId("plant-profile-context-input-medium"), {
      target: { value: "soil" },
    });
    fireEvent.click(screen.getByTestId("plant-profile-context-cancel"));
    expect(screen.queryByTestId("plant-profile-context-edit-form")).toBeNull();
    expect(screen.getByText("Medium: coco")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("disables save while saving and shows saving label", async () => {
    let release: () => void = () => {};
    const onSave = vi.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    render(<PlantProfileContextCard onSave={onSave} />);
    fireEvent.click(screen.getByTestId("plant-profile-context-add-medium"));
    fireEvent.click(screen.getByTestId("plant-profile-context-save"));
    const saveBtn = screen.getByTestId("plant-profile-context-save");
    await waitFor(() => expect(saveBtn).toBeDisabled());
    expect(saveBtn).toHaveTextContent(/saving/i);
    expect(screen.getByTestId("plant-profile-context-cancel")).toBeDisabled();
    release();
    await waitFor(() =>
      expect(screen.queryByTestId("plant-profile-context-edit-form")).toBeNull(),
    );
  });

  it("shows error state when update fails and stays in edit mode", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Network down"));
    render(<PlantProfileContextCard onSave={onSave} />);
    fireEvent.click(screen.getByTestId("plant-profile-context-add-medium"));
    fireEvent.click(screen.getByTestId("plant-profile-context-save"));
    const err = await screen.findByTestId("plant-profile-context-edit-error");
    expect(err).toHaveTextContent(/network down/i);
    expect(screen.getByTestId("plant-profile-context-edit-form")).toBeInTheDocument();
  });

  it("re-renders with updated medium/pot size after parent refresh", () => {
    const { rerender } = render(
      <PlantProfileContextCard medium={null} potSize={null} onSave={vi.fn()} />,
    );
    expect(
      screen.getByText("Medium is not available on this plant profile yet."),
    ).toBeInTheDocument();
    rerender(
      <PlantProfileContextCard medium="coco" potSize="11 L" onSave={vi.fn()} />,
    );
    expect(screen.getByText("Medium: coco")).toBeInTheDocument();
    expect(screen.getByText("Pot size: 11 L")).toBeInTheDocument();
  });
});

describe("buildPlantProfileMetadataPayload (allow-list)", () => {
  it("includes only medium and pot_size keys", () => {
    const payload = buildPlantProfileMetadataPayload({
      medium: "coco",
      potSize: "11 L",
    });
    expect(Object.keys(payload).sort()).toEqual(["medium", "pot_size"]);
  });

  it("normalizes blank/whitespace strings to null", () => {
    expect(buildPlantProfileMetadataPayload({ medium: "   ", potSize: "" })).toEqual({
      medium: null,
      pot_size: null,
    });
  });

  it("ignores forbidden keys passed in via loose objects", () => {
    const loose = {
      medium: "soil",
      potSize: "5 gal",
      stage: "Flower",
      strain: "Pwn",
      is_archived: true,
    } as unknown as { medium: string; potSize: string };
    const payload = buildPlantProfileMetadataPayload(loose);
    expect(payload).toEqual({ medium: "soil", pot_size: "5 gal" });
    expect((payload as unknown as Record<string, unknown>).stage).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).is_archived).toBeUndefined();
  });
});

describe("PlantProfileContext static safety scan", () => {
  it("presenter/view-model files contain no persistence/write paths", () => {
    const files = [
      "src/lib/plantProfileContextViewModel.ts",
      "src/components/PlantProfileContextCard.tsx",
    ];
    const forbidden = [
      /supabase/i,
      /\.insert\s*\(/,
      /\.update\s*\(/,
      /\.upsert\s*\(/,
      /\.delete\s*\(/,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/i,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const pattern of forbidden) {
        expect(
          pattern.test(src),
          `${rel} must not contain ${pattern}`,
        ).toBe(false);
      }
    }
  });

  it("write helper only touches the plants table and the allow-listed columns", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/plantProfileMetadataUpdate.ts"),
      "utf8",
    );
    // No AI, Action Queue, alerts, sensor, or device-control side effects.
    // Strip block comments before scanning so doc-comment mentions of
    // "alerts" / "device" / etc. don't trip the static safety check.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/action_queue/i);
    expect(code).not.toMatch(/\balerts?\b/i);
    expect(code).not.toMatch(/sensor_readings/i);
    expect(code).not.toMatch(/\bdevice\b/i);
    expect(code).not.toMatch(/openai|functions\.invoke/i);
    // Only updates the plants table.
    const updateMatches = code.match(/\.from\(['"]([^'"]+)['"]\)/g) ?? [];
    for (const m of updateMatches) {
      expect(m).toContain("plants");
    }
  });
});
