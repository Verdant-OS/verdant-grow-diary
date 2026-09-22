import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssignTentDialog from "@/components/AssignTentDialog";

const state = vi.hoisted(() => ({
  huntId: "hunt-1" as string | null,
  tagError: false,
  ownerReadError: false,
  untagError: false,
  sameGrow: true,
  growName: "Banana Cough" as string | null,
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "plants") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: state.tagError ? null : { pheno_hunt_id: state.huntId },
                error: state.tagError ? { message: "tag read unavailable" } : null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              state.writes.push({ table, payload });
              if ("pheno_hunt_id" in payload) {
                if (state.untagError) return { error: { message: "untag rejected" } };
                state.huntId = null;
              }
              return { error: null };
            },
          }),
        };
      }
      if (table === "diary_entries")
        return {
          insert: async (payload: Record<string, unknown>) => {
            state.writes.push({ table, payload });
            return { error: null };
          },
        };
      if (table !== "tents") throw new Error(`Unexpected table: ${table}`);
      const filters = new Map<string, unknown>();
      let selection = "";
      const query = {
        select: (value: string) => {
          selection = value;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.set(key, value);
          return query;
        },
        order: async () => {
          if (!filters.has("grow_id") && state.ownerReadError) {
            return { data: null, error: { message: "owner tents unavailable" } };
          }
          const rows = [
            ...(state.sameGrow
              ? [
                  { id: "current", name: "Veg Tent B", grow_id: "grow-a", is_archived: false },
                  { id: "same", name: "Veg Tent A", grow_id: "grow-a", is_archived: false },
                ]
              : []),
            { id: "male", name: "Male Tent", grow_id: "grow-b", is_archived: false },
            { id: "archived", name: "Retired Tent", grow_id: "grow-b", is_archived: true },
          ].filter((row) =>
            [...filters].every(([key, value]) => row[key as keyof typeof row] === value),
          );
          return {
            data: rows.map((row) => ({
              ...row,
              ...(selection.includes("grow:grows")
                ? {
                    grow:
                      row.grow_id === "grow-b"
                        ? state.growName == null
                          ? null
                          : { name: state.growName }
                        : { name: "Skunk Gas Run" },
                  }
                : {}),
            })),
            error: null,
          };
        },
      };
      return query;
    },
  },
}));

beforeEach(() => {
  Object.assign(state, {
    huntId: "hunt-1",
    tagError: false,
    ownerReadError: false,
    untagError: false,
    sameGrow: true,
    growName: "Banana Cough",
    writes: [],
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

function openDialog(growId: string | null = "grow-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AssignTentDialog plantId="plant-1" growId={growId} currentTentId="current" open />
    </QueryClientProvider>,
  );
}

async function openPicker() {
  const picker = await screen.findByTestId("assign-tent-select");
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  return screen.findByRole("listbox");
}

describe("Move Plant other-grow destination disclosure", () => {
  it("never also renders an enabled alias for a blocked tent when plant grow is missing", async () => {
    state.sameGrow = false;
    openDialog(null);
    await screen.findByTestId("assign-tent-pheno-untag");
    await openPicker();
    expect(await screen.findByRole("option", { name: /Male Tent — Banana Cough/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByRole("option", { name: "Male Tent" })).toBeNull();
  });
  it("shows the grow-labelled hunt-blocked tent as a disabled real option without writing", async () => {
    openDialog();
    await screen.findByTestId("assign-tent-pheno-untag");
    await openPicker();
    const option = await screen.findByRole("option", { name: /Male Tent — Banana Cough/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent(/untag.*first/i);
    fireEvent.click(option);
    expect(screen.queryByRole("option", { name: /Retired Tent/ })).toBeNull();
    expect(screen.getByTestId("assign-tent-submit")).toBeDisabled();
    expect(state.writes).toEqual([]);
  });

  it("keeps explicit untag and grow-changing move as separate confirmations", async () => {
    openDialog();
    fireEvent.click(await screen.findByTestId("assign-tent-pheno-untag-open"));
    fireEvent.click(await screen.findByTestId("assign-tent-pheno-untag-submit"));
    await waitFor(() =>
      expect(state.writes).toEqual([
        { table: "plants", payload: { pheno_hunt_id: null, candidate_label: null } },
      ]),
    );
    await openPicker();
    const option = await screen.findByRole("option", { name: "Male Tent — Banana Cough" });
    expect(option).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId("assign-tent-submit"));
    await waitFor(() => expect(state.writes).toHaveLength(3));
    expect(state.writes[1]).toEqual({
      table: "plants",
      payload: { tent_id: "male", grow_id: "grow-b" },
    });
    expect(state.writes[2]).toMatchObject({
      table: "diary_entries",
      payload: {
        plant_id: "plant-1",
        tent_id: "male",
        grow_id: "grow-b",
        note: "Moved plant from Veg Tent B to Male Tent.",
      },
    });
  });

  it("offers the disabled destination even when this grow has no tents", async () => {
    state.sameGrow = false;
    openDialog();
    await waitFor(() => expect(screen.queryByTestId("assign-tent-empty")).toBeNull());
    await openPicker();
    expect(await screen.findByRole("option", { name: /Male Tent — Banana Cough/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("reports missing grow names without substituting the current grow's name", async () => {
    state.growName = null;
    openDialog();
    await screen.findByTestId("assign-tent-pheno-untag");
    await openPicker();
    expect(
      await screen.findByRole("option", { name: /Male Tent — Grow name unavailable/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("uses unresolved copy instead of claiming hunt membership when the tag read fails", async () => {
    state.tagError = true;
    openDialog();
    await screen.findByTestId("assign-tent-hunt-tag-error");
    await openPicker();
    const option = await screen.findByRole("option", { name: /Male Tent — Banana Cough/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("Pheno Hunt status is unavailable");
    expect(option).not.toHaveTextContent(/untag.*first/i);
    expect(state.writes).toEqual([]);
  });

  it("reports a failed other-grow read instead of presenting it as an empty list", async () => {
    state.ownerReadError = true;
    openDialog();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Could not load destinations in other grows",
    );
    await openPicker();
    expect(screen.getByRole("option", { name: "Veg Tent A" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(state.writes).toEqual([]);
  });

  it("retains the disabled destination after a rejected untag", async () => {
    state.untagError = true;
    openDialog();
    fireEvent.click(await screen.findByTestId("assign-tent-pheno-untag-open"));
    fireEvent.click(await screen.findByTestId("assign-tent-pheno-untag-submit"));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    fireEvent.click(screen.getByTestId("assign-tent-pheno-untag-cancel"));
    await openPicker();
    expect(await screen.findByRole("option", { name: /Male Tent — Banana Cough/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(state.writes).toEqual([
      { table: "plants", payload: { pheno_hunt_id: null, candidate_label: null } },
    ]);
  });

  it("preserves the same-grow write and original movement note", async () => {
    openDialog();
    await openPicker();
    fireEvent.click(await screen.findByRole("option", { name: "Veg Tent A" }));
    fireEvent.click(screen.getByTestId("assign-tent-submit"));
    await waitFor(() => expect(state.writes).toHaveLength(2));
    expect(state.writes[0]).toEqual({ table: "plants", payload: { tent_id: "same" } });
    expect(state.writes[1]).toMatchObject({
      table: "diary_entries",
      payload: {
        grow_id: "grow-a",
        note: "Moved plant from Veg Tent B to Veg Tent A.",
      },
    });
  });
});
