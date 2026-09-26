/**
 * Text typed into /feedback or /contact before the page hydrates must survive
 * hydration.
 *
 * Found by the batched core-link census (#1478 port, #1683): /feedback became
 * the first route of a fresh browser context, the census filled a field on
 * the server-rendered page, and the field read back "" once the page
 * hydrated. react-hook-form's `register` writes each field's default value
 * into the DOM when the field mounts, so anything typed before hydration was
 * wiped — a grower on a slow connection would lose their text the same way.
 */
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { fireEvent } from "@testing-library/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { preHydrationTypedValue, registerKeepingTypedText } from "@/lib/preHydrationFormInput";
import Contact from "@/pages/support/Contact";
import Feedback from "@/pages/support/Feedback";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

const TYPED = "Verdant browser census";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Server-render, type into `selector` before hydration, then hydrate. */
async function typeBeforeHydration(page: React.ReactElement, selector: string) {
  const tree = <MemoryRouter>{page}</MemoryRouter>;
  container = document.createElement("div");
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!field) throw new Error(`no field for ${selector}`);
  field.value = TYPED;
  await act(async () => {
    root = hydrateRoot(container!, tree, { onRecoverableError: () => {} });
  });
  return field;
}

describe("support forms keep text typed before hydration", () => {
  it("QA repro: /feedback keeps a textarea value typed before hydration", async () => {
    const field = await typeBeforeHydration(<Feedback />, 'textarea[name="whats_working"]');
    expect(field.isConnected).toBe(true);
    expect(field.value).toBe(TYPED);
  });

  it("/feedback keeps an input value typed before hydration", async () => {
    const field = await typeBeforeHydration(<Feedback />, 'input[name="grow_context"]');
    expect(field.value).toBe(TYPED);
  });

  it("/contact keeps a textarea value typed before hydration", async () => {
    const field = await typeBeforeHydration(<Contact />, 'textarea[name="message"]');
    expect(field.value).toBe(TYPED);
  });

  it("an untouched field still hydrates empty", async () => {
    await typeBeforeHydration(<Feedback />, 'textarea[name="whats_working"]');
    const other = container!.querySelector<HTMLTextAreaElement>('textarea[name="whats_friction"]');
    expect(other?.value).toBe("");
  });
});

describe("registerKeepingTypedText", () => {
  let renders = 0;
  let latest: UseFormReturn<{ note: string }> | null = null;

  function NoteForm() {
    renders += 1;
    const form = useForm<{ note: string }>({ defaultValues: { note: "" } });
    latest = form;
    const register = registerKeepingTypedText(form);
    return <textarea {...register("note")} />;
  }

  it("puts pre-hydration text into the form state, not just the DOM, without a render loop", async () => {
    renders = 0;
    const field = await typeBeforeHydration(<NoteForm />, 'textarea[name="note"]');
    expect(field.value).toBe(TYPED);
    expect(latest!.getValues("note")).toBe(TYPED);
    expect(latest!.getFieldState("note").isDirty).toBe(true);
    expect(renders).toBeLessThan(6);
    // Typing after hydration still flows through react-hook-form as normal.
    act(() => {
      fireEvent.input(field, { target: { value: `${TYPED} again` } });
    });
    expect(latest!.getValues("note")).toBe(`${TYPED} again`);
  });

  it("leaves a field alone when nothing was typed before hydration", async () => {
    const tree = <NoteForm />;
    container = document.createElement("div");
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    await act(async () => {
      root = hydrateRoot(container!, tree);
    });
    expect(latest!.getValues("note")).toBe("");
    expect(latest!.getFieldState("note").isDirty).toBe(false);
  });
});

describe("preHydrationTypedValue", () => {
  function el(tag: "input" | "textarea", attrs: Record<string, string> = {}) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  it("returns text that differs from what the server rendered", () => {
    const area = el("textarea");
    area.value = "typed";
    expect(preHydrationTypedValue(area)).toBe("typed");
    const input = el("input", { type: "email", value: "server@example.com" });
    input.value = "grower@example.com";
    expect(preHydrationTypedValue(input)).toBe("grower@example.com");
  });

  it("returns null for untouched fields, non-text inputs and non-elements", () => {
    expect(preHydrationTypedValue(el("textarea"))).toBeNull();
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = true;
    expect(preHydrationTypedValue(box)).toBeNull();
    expect(preHydrationTypedValue(el("input", { type: "hidden", value: "x" }))).toBeNull();
    expect(preHydrationTypedValue(null)).toBeNull();
    expect(preHydrationTypedValue({ value: 3 })).toBeNull();
  });
});
