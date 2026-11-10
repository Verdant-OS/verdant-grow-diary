import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldNotebookScope } from "@/components/FieldNotebookMount";
import { clearNotebookSession } from "@/lib/fieldNotebookSession";

const getUser = vi.fn();
const idempotencyMaybeSingle = vi.fn();
const eventMaybeSingle = vi.fn();
const seen = { userId: null as string | null, key: null as string | null };
const save = vi.fn();

vi.mock("@/hooks/useQuickLogV2Save", () => ({
  useQuickLogV2Save: () => ({ save }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUser() },
    from: (table: string) => {
      if (table === "quicklog_idempotency") {
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              if (column === "user_id") seen.userId = value;
              return {
                eq: (keyColumn: string, key: string) => {
                  if (keyColumn === "idempotency_key") seen.key = key;
                  return { maybeSingle: idempotencyMaybeSingle };
                },
              };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: eventMaybeSingle }),
        }),
      };
    },
  },
}));

const eventId = "11111111-1111-4111-8111-111111111111";

function renderMount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FieldNotebookScope
        growsLoading={false}
        growId="grow-1"
        tents={[{ id: "flower", name: "Flower Tent 2" }]}
      />
    </QueryClientProvider>,
  );
}

describe("FieldNotebookMount key lookup", () => {
  beforeEach(() => {
    clearNotebookSession();
    seen.userId = null;
    seen.key = null;
    save.mockReset();
    getUser.mockReset();
    idempotencyMaybeSingle.mockReset();
    eventMaybeSingle.mockReset();
    save.mockResolvedValue({ ok: false, reason: "offline" });
  });

  it("passes the signed-in user and the attempt key, then confirms a found row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    idempotencyMaybeSingle.mockResolvedValue({ data: { grow_event_id: eventId }, error: null });
    eventMaybeSingle.mockResolvedValue({
      data: {
        id: eventId,
        tent_id: "flower",
        note: "leaves are pale",
        occurred_at: "2025-01-08T15:24:00.000Z",
        event_type: "observation",
        source: "manual",
        is_deleted: false,
      },
      error: null,
    });
    renderMount();
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    expect(
      await screen.findByText(
        "This note may not have saved. Check Timeline. It stays here so you can copy it.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check Timeline" }));
    expect(await screen.findByText("Yes, that's it")).toBeInTheDocument();
    expect(seen.userId).toBe("user-1");
    expect(seen.key).toBeTruthy();
    expect(save).toHaveBeenCalledOnce();
  });

  it("fails closed when the user id is null", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    renderMount();
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Check Timeline" }));
    expect(
      await screen.findByText(
        "This note may not have saved. Check Timeline. It stays here so you can copy it.",
      ),
    ).toBeInTheDocument();
    expect(seen.userId).toBeNull();
    expect(idempotencyMaybeSingle).not.toHaveBeenCalled();
  });

  it("fails closed when the attempt key is null", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    renderMount();
    fireEvent.change(screen.getByPlaceholderText("Add what you observed."), {
      target: { value: "leaves are pale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save to Flower Tent 2" }));
    const button = await screen.findByRole("button", { name: "Check Timeline" });
    seen.key = null;
    fireEvent.click(button);
    await screen.findByText(
      "This note may not have saved. Check Timeline. It stays here so you can copy it.",
    );
    expect(seen.key).not.toBeNull();
  });
});
