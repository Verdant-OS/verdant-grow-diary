/**
 * QA 2026-09-24, BUG-020 (S1): Edit Plant always opened with Type "Not sure"
 * because PlantCardActionsMenu never forwarded the stored type, and every
 * save wrote `plant_type: "unknown"`. Changing only the start date erased
 * `autoflower`; an unchanged open-and-save erased `photoperiod`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditPlantDialog from "@/components/EditPlantDialog";
import { buildPlantTypeUpdate } from "@/lib/plantTypeRules";

const backend = vi.hoisted(() => ({
  updates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), message: vi.fn() }));
const tents = vi.hoisted(() => [{ id: "tent-a", name: "Tent A", grow_id: "grow-a" }]);

vi.mock("sonner", () => ({ toast }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => ({ data: tents }) }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => <span>Profile photo</span> }));
vi.mock("@/hooks/usePlantProfilePhotoPreview", () => ({
  usePlantProfilePhotoPreview: () => ({ preview: { status: "none" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          backend.updates.push({ id, payload: { ...payload } });
          return { error: null };
        },
      }),
    }),
  },
}));

function renderEditor(plantType: string | null | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EditPlantDialog
        plant={{
          id: "plant-a",
          name: "QA-Plant-Auto",
          strain: "Auto strain",
          stage: "flower",
          health: "healthy",
          tentId: "tent-a",
          growId: "grow-a",
          lastNote: "",
          startedAt: "2026-07-01T00:00:00+00:00",
          ...(plantType === undefined ? {} : { plantType }),
        }}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId("edit-plant-trigger"));
}

function typeSelect() {
  const label = screen.getByText("Type", { selector: "label" });
  if (!label.parentElement) throw new Error("Missing type control container");
  return within(label.parentElement).getByRole("combobox");
}

beforeEach(() => {
  backend.updates.length = 0;
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("buildPlantTypeUpdate", () => {
  it("writes only a real change and never erases a type the form never saw", () => {
    expect(buildPlantTypeUpdate("autoflower", "autoflower")).toEqual({});
    expect(buildPlantTypeUpdate("autoflower", "photoperiod")).toEqual({
      plant_type: "photoperiod",
    });
    expect(buildPlantTypeUpdate("autoflower", "unknown")).toEqual({ plant_type: "unknown" });
    expect(buildPlantTypeUpdate(undefined, "unknown")).toEqual({});
    expect(buildPlantTypeUpdate(undefined, "autoflower")).toEqual({ plant_type: "autoflower" });
    expect(buildPlantTypeUpdate(null, "unknown")).toEqual({});
    expect(buildPlantTypeUpdate("auto", "autoflower")).toEqual({});
  });
});

describe("Edit Plant preserves the stored plant type", () => {
  it("prefills Autoflower and does not rewrite it on a start-date-only edit", async () => {
    renderEditor("autoflower");
    expect(typeSelect()).toHaveTextContent("Autoflower");
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].payload).not.toHaveProperty("plant_type");
  });

  it("never writes unknown when the caller did not supply the stored type", async () => {
    renderEditor(undefined);
    fireEvent.change(screen.getByTestId("edit-plant-name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByTestId("edit-plant-submit"));
    await waitFor(() => expect(backend.updates).toHaveLength(1));
    expect(backend.updates[0].payload).toMatchObject({ name: "Renamed" });
    expect(backend.updates[0].payload).not.toHaveProperty("plant_type");
  });

  it("every PlantCardActionsMenu caller forwards the stored type", () => {
    // @source-scan-justified: the three callers are full pages (Plant Detail,
    // Plants, Tent Detail); the forwarded prop is asserted at each call site.
    for (const path of [
      "src/pages/PlantDetail.tsx",
      "src/pages/Plants.tsx",
      "src/pages/TentDetail.tsx",
    ]) {
      const src = readFileSync(resolve(process.cwd(), path), "utf8");
      const call = src.slice(src.indexOf("<PlantCardActionsMenu"));
      expect(call.slice(0, 900), path).toMatch(/plantType: \w+\.plantType \?\? null/);
    }
  });
});
