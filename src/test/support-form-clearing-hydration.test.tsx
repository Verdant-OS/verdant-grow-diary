import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { fireEvent } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import * as preservation from "@/lib/preHydrationFormInput";
import Feedback from "@/pages/support/Feedback";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

const TYPED = "Verdant browser census";
let root: Root | null = null;
let container: HTMLDivElement;
let noteForm: UseFormReturn<{ note: string }>;
let phases: string[];

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  vi.restoreAllMocks();
});

function NoteForm() {
  const [revision, setRevision] = useState(0);
  const form = useForm({ defaultValues: { note: "" } });
  noteForm = form;
  const registration = preservation.registerKeepingTypedText(form)("note");
  return (
    <form data-revision={revision}>
      <textarea
        {...registration}
        ref={(element) => {
          if (element) phases.push("ref");
          registration.ref(element);
        }}
      />
      <button type="button" onClick={() => setRevision((value) => value + 1)}>
        Rerender
      </button>
    </form>
  );
}

function serverRender<T extends HTMLInputElement | HTMLTextAreaElement = HTMLTextAreaElement>(
  tree: React.ReactElement,
  selector = 'textarea[name="note"]',
) {
  phases = [];
  container = document.createElement("div");
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);
  const field = container.querySelector<T>(selector);
  if (!field) throw new Error(`Missing server-rendered ${selector}`);
  return field;
}

async function hydrate(tree: React.ReactElement) {
  const errors: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError: (error) => errors.push(error) });
  });
  expect(errors).toEqual([]);
}

function expectNote(field: HTMLTextAreaElement, value: string) {
  expect(field.isConnected).toBe(true);
  expect(container.querySelector("textarea")).toBe(field);
  expect(field.value).toBe(value);
  expect(noteForm.getValues("note")).toBe(value);
}

describe("clearing at actual hydration and registration boundaries", () => {
  it("preserves type → clear → hydrate with Feedback's empty default, including after rerender", async () => {
    const tree = <NoteForm />;
    const field = serverRender(tree);
    field.value = TYPED;
    fireEvent.input(field);
    field.value = "";
    fireEvent.input(field);
    expect(phases).toEqual([]);
    await hydrate(tree);
    expectNote(field, "");
    act(() => fireEvent.click(container.querySelector("button")!));
    expectNote(field, "");
  });

  it("retains nonempty pre-hydration text in both DOM and RHF before clearing", async () => {
    const tree = <NoteForm />;
    const field = serverRender(tree);
    field.value = TYPED;
    await hydrate(tree);
    expectNote(field, TYPED);
    act(() => fireEvent.input(field, { target: { value: "" } }));
    expectNote(field, "");
    act(() => fireEvent.click(container.querySelector("button")!));
    expectNote(field, "");
  });

  it("preserves a clear after hydration is scheduled but before the first ref attaches", async () => {
    const tree = <NoteForm />;
    const field = serverRender(tree);
    field.value = TYPED;
    const errors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(container, tree, { onRecoverableError: (error) => errors.push(error) });
      expect(phases).toEqual([]);
      field.value = "";
      phases.push("clear");
      fireEvent.input(field);
    });
    expect(errors).toEqual([]);
    expect(phases[0]).toBe("clear");
    expect(phases).toContain("ref");
    expectNote(field, "");
    act(() => fireEvent.click(container.querySelector("button")!));
    expectNote(field, "");
  });
});

describe("selection during pre-hydration text adoption", () => {
  it.each([
    { label: "full forward selection", start: 0, end: TYPED.length, direction: "forward" as const },
    { label: "partial backward selection", start: 2, end: 12, direction: "backward" as const },
    { label: "caret in the middle", start: 5, end: 5, direction: "none" as const },
  ])(
    "preserves $label through hydration and a later ref attachment",
    async ({ start, end, direction }) => {
      const tree = <NoteForm />;
      const field = serverRender(tree);
      field.value = TYPED;
      field.focus();
      field.setSelectionRange(start, end, direction);
      await hydrate(tree);
      expectNote(field, TYPED);
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([
        start,
        end,
        direction,
      ]);
      const setSelection = vi.spyOn(field, "setSelectionRange");
      act(() => fireEvent.click(container.querySelector("button")!));
      expectNote(field, TYPED);
      expect(document.activeElement).toBe(field);
      expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([
        start,
        end,
        direction,
      ]);
      expect(setSelection).not.toHaveBeenCalled();
    },
  );

  it("adopts an unfocused field without taking focus or setting its selection", async () => {
    const tree = <NoteForm />;
    const field = serverRender(tree);
    field.value = TYPED;
    const button = container.querySelector("button")!;
    button.focus();
    const setSelection = vi.spyOn(field, "setSelectionRange");
    await hydrate(tree);
    expectNote(field, TYPED);
    expect(document.activeElement).toBe(button);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it("retains adopted text when an optional selection setter fails", async () => {
    const tree = <NoteForm />;
    const field = serverRender(tree);
    field.value = TYPED;
    field.focus();
    field.setSelectionRange(2, 12, "backward");
    vi.spyOn(field, "setSelectionRange").mockImplementation(() => {
      throw new DOMException("Selection is unavailable", "InvalidStateError");
    });
    await hydrate(tree);
    expectNote(field, TYPED);
  });

  it.each([
    { type: "email", value: "grower@example.test" },
    { type: "number", value: "42" },
  ])(
    "adopts focused $type input text without unsupported selection writes",
    async ({ type, value }) => {
      function InputForm() {
        const form = useForm({ defaultValues: { note: "" } });
        noteForm = form;
        return <input type={type} {...preservation.registerKeepingTypedText(form)("note")} />;
      }
      const tree = <InputForm />;
      const field = serverRender<HTMLInputElement>(tree, 'input[name="note"]');
      field.value = value;
      field.focus();
      expect(field.selectionStart).toBeNull();
      const setSelection = vi.spyOn(field, "setSelectionRange");
      await hydrate(tree);
      expect(field.isConnected).toBe(true);
      expect(field.value).toBe(value);
      expect(noteForm.getValues("note")).toBe(value);
      expect(document.activeElement).toBe(field);
      expect(setSelection).not.toHaveBeenCalled();
    },
  );
});

describe.each(["whats_friction", "one_improvement"])("Feedback %s", (name) => {
  it.each(["before hydration", "after registration"])(
    "keeps clearing %s through a real rating-driven rerender",
    async (boundary) => {
      let observedForm: { getValues: (field: string) => unknown } | undefined;
      const actualRegister = preservation.registerKeepingTypedText;
      // Observe the real page's form; registration and events still execute unmodified.
      vi.spyOn(preservation, "registerKeepingTypedText").mockImplementation((form) => {
        observedForm = form as unknown as typeof observedForm;
        return actualRegister(form);
      });
      const tree = (
        <MemoryRouter>
          <Feedback />
        </MemoryRouter>
      );
      const selector = `textarea[name="${name}"]`;
      const field = serverRender(tree, selector);
      field.value = TYPED;
      if (boundary === "before hydration") {
        field.value = "";
        fireEvent.input(field);
      }
      await hydrate(tree);
      if (boundary === "after registration") {
        expect(field.value).toBe(TYPED);
        expect(observedForm!.getValues(name)).toBe(TYPED);
        act(() => fireEvent.input(field, { target: { value: "" } }));
      }
      expect(field.value).toBe("");
      expect(observedForm!.getValues(name)).toBe("");
      act(() => fireEvent.click(container.querySelector<HTMLButtonElement>('[role="radio"]')!));
      expect(container.querySelector(selector)).toBe(field);
      expect(field.isConnected).toBe(true);
      expect(field.value).toBe("");
      expect(observedForm!.getValues(name)).toBe("");
    },
  );
});
