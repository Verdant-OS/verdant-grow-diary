import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "@/lib/react-router-compat";

const { from, presentations } = vi.hoisted(() => ({
  from: vi.fn(),
  presentations: [] as { grow: string; plants: string[] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
vi.mock("@/components/genetics/BreedingLogContainer", () => ({
  BreedingLogContainer: (props: {
    activeGrowId: string;
    plants: { id: string; name: string }[];
  }) => {
    presentations.push({ grow: props.activeGrowId, plants: props.plants.map((p) => p.id) });
    return <div data-testid="save-target">{JSON.stringify(presentations.at(-1))}</div>;
  },
}));
import BreedingLogNew from "@/pages/BreedingLogNew";

type Table = "tents" | "grows" | "plants";
type Result = { data: unknown; error: { message: string } | null };
type Read = { table: Table; filters: [string, string][]; or?: string };
let reads: Read[];
let respond: (read: Read) => Result | Promise<Result>;
const ok = (data: unknown): Result => ({ data, error: null });
const failed: Result = { data: null, error: { message: "private database detail" } };

function healthy(read: Read): Result {
  const scope =
    read.filters.find(([key]) => key === "grow_id" || key === "id")?.[1] ??
    (read.or?.includes("grow_id.eq.B") ? "B" : "A");
  if (read.table === "tents") return ok([{ id: `tent-${scope}` }]);
  if (read.table === "grows") return ok({ id: scope, name: `Grow ${scope}` });
  const tent = read.filters.find(([key]) => key === "tent_id")?.[1] ?? `tent-${scope}`;
  return ok([{ id: `plant-${scope}-${tent}`, name: `Plant ${scope}`, tent_id: tent }]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/breeding/log/new?growId=B")}>Grow B</button>
      <button onClick={() => navigate("/breeding/log/new?growId=A&tentId=other")}>
        Other tent
      </button>
      <button onClick={() => navigate("/breeding/log/new")}>No grow</button>
    </>
  );
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/breeding/log/new?growId=A"]}>
      <Navigation />
      <BreedingLogNew />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reads = [];
  presentations.length = 0;
  respond = healthy;
  from.mockReset().mockImplementation((table: Table) => {
    const read: Read = { table, filters: [] };
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        read.filters.push([key, value]);
        return query;
      },
      or: (value: string) => {
        read.or = value;
        return query;
      },
      maybeSingle: () => query,
      then: (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) => {
        reads.push(read);
        return Promise.resolve()
          .then(() => respond(read))
          .then(resolve, reject);
      },
    };
    return query;
  });
});

describe("breeding log confirmed reads and target isolation", () => {
  it.each<Table>(["tents", "grows", "plants"])("rejected %s read is recoverable", async (table) => {
    respond = (read) => {
      if (read.table === table) throw new Error("offline transport detail");
      return healthy(read);
    };
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Breeding context unavailable");
    expect(screen.queryByText("offline transport detail")).not.toBeInTheDocument();
    respond = healthy;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("save-target")).toHaveTextContent("plant-A-tent-A");
  });

  it.each<Table>(["tents", "grows", "plants"])(
    "%s error wins over accompanying data",
    async (table) => {
      respond = (read) =>
        read.table === table ? { ...healthy(read), error: failed.error } : healthy(read);
      mount();
      await screen.findByRole("alert");
      expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
    },
  );

  it("repeated failed retries never claim successful empty", async () => {
    respond = (read) => (read.table === "plants" ? failed : healthy(read));
    mount();
    for (let attempt = 0; attempt < 2; attempt++) {
      await screen.findByRole("alert");
      expect(screen.queryByText("No plants in this grow yet")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    }
    await screen.findByRole("alert");
    expect(reads.filter((read) => read.table === "plants")).toHaveLength(3);
  });

  it("removing grow identity removes the old form without another read", async () => {
    mount();
    await screen.findByTestId("save-target");
    const count = reads.length;
    await userEvent.click(screen.getByRole("button", { name: "No grow" }));
    await screen.findByText("Grow not found");
    expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
    expect(reads).toHaveLength(count);
  });

  it("empty tent membership still permits directly attributed plants", async () => {
    respond = (read) => (read.table === "tents" ? ok([]) : healthy(read));
    mount();
    await screen.findByTestId("save-target");
    expect(reads.find((r) => r.table === "plants")?.or).toBe("grow_id.eq.A");
  });

  it.each<Table>(["tents", "grows", "plants"])(
    "%s failure stays unavailable and Retry reloads context",
    async (table) => {
      respond = (read) => (read.table === table ? failed : healthy(read));
      mount();
      expect(await screen.findByRole("alert")).toHaveTextContent("Breeding context unavailable");
      expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
      expect(screen.queryByText("Grow not found")).not.toBeInTheDocument();
      expect(screen.queryByText("No plants in this grow yet")).not.toBeInTheDocument();
      expect(screen.queryByText("private database detail")).not.toBeInTheDocument();
      const before = reads.length;
      respond = healthy;
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByTestId("save-target")).toHaveTextContent("plant-A-tent-A");
      expect(
        reads
          .slice(before)
          .map((r) => r.table)
          .sort(),
      ).toEqual(["grows", "plants", "tents"]);
    },
  );

  it.each<Table>(["tents", "plants"])(
    "null %s result cannot establish empty context",
    async (table) => {
      respond = (read) => (read.table === table ? ok(null) : healthy(read));
      mount();
      expect(await screen.findByRole("alert")).toHaveTextContent("Breeding context unavailable");
      expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
    },
  );

  it("successful empty plants retain the scoped empty CTA", async () => {
    respond = (read) => (read.table === "plants" ? ok([]) : healthy(read));
    mount();
    expect(await screen.findByText("No plants in this grow yet")).toBeInTheDocument();
    expect(screen.getByTestId("breeding-empty-cta")).toHaveAttribute("href", "/grows/A");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("successfully absent grow retains not-found copy", async () => {
    respond = (read) => (read.table === "grows" ? ok(null) : healthy(read));
    mount();
    expect(await screen.findByText("Grow not found")).toBeInTheDocument();
    expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
  });

  it("first pending read never claims an empty grow", async () => {
    const pending = deferred<Result>();
    respond = () => pending.promise;
    const view = mount();
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
    expect(screen.queryByText("Grow not found")).not.toBeInTheDocument();
    expect(screen.queryByText("No plants in this grow yet")).not.toBeInTheDocument();
    view.unmount();
    await act(async () => pending.resolve(ok([])));
  });

  it.each(["Grow B", "Other tent"])(
    "%s navigation immediately hides old plant choices",
    async (destination) => {
      mount();
      await screen.findByTestId("save-target");
      const pending = deferred<Result>();
      respond = (read) => (read.table === "tents" ? pending.promise : healthy(read));
      const mark = presentations.length;
      await userEvent.click(screen.getByRole("button", { name: destination }));
      expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
      expect(presentations.slice(mark)).toEqual([]);
      await act(async () => pending.resolve(ok([{ id: "destination-tent" }])));
      const target = await screen.findByTestId("save-target");
      expect(target).toHaveTextContent(
        destination === "Grow B" ? "plant-B-tent-B" : "plant-A-other",
      );
    },
  );

  it("a missing destination grow never reuses the old grow", async () => {
    mount();
    await screen.findByTestId("save-target");
    respond = (read) => (read.table === "grows" ? ok(null) : healthy(read));
    await userEvent.click(screen.getByRole("button", { name: "Grow B" }));
    expect(await screen.findByText("Grow not found")).toBeInTheDocument();
    expect(screen.queryByTestId("save-target")).not.toBeInTheDocument();
  });

  it("a delayed old response cannot replace the new scope", async () => {
    const pending = deferred<Result>();
    respond = (read) =>
      read.table === "plants" && !read.or?.includes("grow_id.eq.B")
        ? pending.promise
        : healthy(read);
    mount();
    await waitFor(() => expect(reads.some((r) => r.table === "plants")).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Grow B" }));
    expect(await screen.findByTestId("save-target")).toHaveTextContent("plant-B-tent-B");
    await act(async () => pending.resolve(ok([{ id: "late-A", name: "Old A", tent_id: null }])));
    expect(screen.getByTestId("save-target")).not.toHaveTextContent("late-A");
  });
});
