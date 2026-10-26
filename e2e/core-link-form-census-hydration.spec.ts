import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useForm } from "react-hook-form";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import { registerKeepingTypedText } from "../src/lib/preHydrationFormInput";

const TYPED = "Verdant browser census";

type FieldSnapshot = {
  value: string;
  defaultValue: string;
  selectionStart: number;
  selectionEnd: number;
  focused: boolean;
  connected: boolean;
};
type FixtureSnapshot = FieldSnapshot & {
  formValue: string | null;
  hydrated: boolean;
  sameNode: boolean;
  recoverableErrors: string[];
  registrations: Array<{ before: FieldSnapshot; after: FieldSnapshot }>;
  inputEvents: Array<{ value: string; inputType: string }>;
};

declare global {
  interface Window {
    __censusHydrationFixture: {
      hydrate(): void;
      snapshot(): FixtureSnapshot;
    };
  }
}

// Match Feedback's uncontrolled textarea: RHF defaults to empty, with no JSX
// defaultValue. A nonempty React textarea default follows a different init path.
function ServerFixture() {
  const form = useForm({ defaultValues: { note: "" } });
  return createElement(
    "form",
    { "data-revision": 0 },
    createElement("textarea", {
      id: "note",
      "aria-label": "Feedback note",
      rows: 4,
      maxLength: 4000,
      ...registerKeepingTypedText(form)("note"),
    }),
    createElement("button", { type: "button" }, "Rerender"),
  );
}

let browserFixture: string;
const pageErrors = new WeakMap<Page, string[]>();
const attemptedRequests = new WeakMap<Page, string[]>();
test.beforeAll(async () => {
  const helper = resolve(process.cwd(), "src/lib/preHydrationFormInput.ts");
  const bundled = await build({
    absWorkingDir: process.cwd(),
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: "census-hydration-fixture.ts",
      contents: `
        import { createElement, useEffect, useState } from "react";
        import { hydrateRoot } from "react-dom/client";
        import { useForm } from "react-hook-form";
        import { registerKeepingTypedText } from ${JSON.stringify(helper)};

        let actualForm = null;
        let hydrated = false;
        let started = false;
        const registrations = [];
        const inputEvents = [];
        const recoverableErrors = [];
        const field = () => document.getElementById("note");
        const serverField = field();
        const readField = (element) => ({
          value: element.value,
          defaultValue: element.defaultValue,
          selectionStart: element.selectionStart,
          selectionEnd: element.selectionEnd,
          focused: document.activeElement === element,
          connected: element.isConnected,
        });

        document.addEventListener("input", (event) => {
          if (event.target === field()) {
            inputEvents.push({ value: event.target.value, inputType: event.inputType ?? "" });
          }
        });

        function ClientFixture() {
          const [revision, setRevision] = useState(0);
          const form = useForm({ defaultValues: { note: "" } });
          actualForm = form;
          const registration = registerKeepingTypedText(form)("note");
          useEffect(() => { hydrated = true; }, []);
          return createElement("form", { "data-revision": revision },
            createElement("textarea", {
              id: "note", "aria-label": "Feedback note", rows: 4, maxLength: 4000,
              ...registration,
              ref: (element) => {
                if (!element) { registration.ref(element); return; }
                const before = readField(element);
                registration.ref(element);
                // Observe the real delegate; never inject a clear or replace its behavior.
                registrations.push({ before, after: readField(element) });
              },
            }),
            createElement("button", {
              type: "button", onClick: () => setRevision((value) => value + 1),
            }, "Rerender"),
          );
        }

        window.__censusHydrationFixture = {
          hydrate() {
            if (started) throw new Error("Fixture hydration may run only once");
            started = true;
            hydrateRoot(document.getElementById("fixture"), createElement(ClientFixture), {
              onRecoverableError: (error) => { recoverableErrors.push(String(error)); },
            });
          },
          snapshot() {
            return {
              ...readField(field()), hydrated, sameNode: field() === serverField,
              formValue: actualForm ? actualForm.getValues("note") : null,
              registrations, inputEvents, recoverableErrors,
            };
          },
        };
      `,
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    write: false,
    define: { "process.env.NODE_ENV": '"development"' },
  });
  browserFixture = bundled.outputFiles![0].text;
});

test.beforeEach(async ({ page }) => {
  test.skip(
    test.info().project.name !== "chromium-mocked",
    "Credential-free Chromium fixture only",
  );
  pageErrors.set(page, []);
  attemptedRequests.set(page, []);
  page.on("pageerror", (error) => pageErrors.get(page)!.push(error.message));
  page.on("request", (request) => attemptedRequests.get(page)!.push(request.url()));
  await page.route("**/*", (route) => route.abort());
  await page.setContent(
    `<main id="fixture">${renderToString(createElement(ServerFixture))}</main>`,
  );
  await page.addScriptTag({ content: browserFixture });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
  expect(attemptedRequests.get(page) ?? []).toEqual([]);
});

async function snapshot(page: Page): Promise<FixtureSnapshot> {
  return page.evaluate(() => window.__censusHydrationFixture.snapshot());
}

async function hydrate(page: Page) {
  await page.evaluate(() => window.__censusHydrationFixture.hydrate());
  await expect.poll(async () => (await snapshot(page)).hydrated).toBe(true);
  expect(await snapshot(page)).toMatchObject({ sameNode: true, recoverableErrors: [] });
}

async function expectEmptyThroughRerender(page: Page) {
  expect(await snapshot(page)).toMatchObject({
    value: "",
    formValue: "",
    connected: true,
    sameNode: true,
  });
  await page.getByRole("button", { name: "Rerender", exact: true }).click();
  await expect(page.locator("form")).toHaveAttribute("data-revision", "1");
  expect(await snapshot(page)).toMatchObject({
    value: "",
    formValue: "",
    connected: true,
    sameNode: true,
  });
}

test("keeps a pre-hydration type then clear empty in DOM and real RHF state", async ({ page }) => {
  const field = page.getByRole("textbox", { name: "Feedback note", exact: true });
  await field.fill(TYPED);
  await field.fill("");
  expect(await snapshot(page)).toMatchObject({ value: "", hydrated: false, registrations: [] });
  await hydrate(page);
  await expectEmptyThroughRerender(page);
});

test("keeps a clear after hydration empty in DOM and real RHF state", async ({ page }) => {
  await hydrate(page);
  const field = page.getByRole("textbox", { name: "Feedback note", exact: true });
  await field.fill(TYPED);
  expect(await snapshot(page)).toMatchObject({ value: TYPED, formValue: TYPED });
  await field.fill("");
  await expectEmptyThroughRerender(page);
});

test("preserves select-all then Delete when real hydration commits between those operations", async ({
  page,
}) => {
  const field = page.getByRole("textbox", { name: "Feedback note", exact: true });
  await field.fill(TYPED);
  // These are the real browser operations used by Playwright's empty fill:
  // select the textarea, then send Delete. Deliberately place hydration between them.
  await field.selectText();
  const selected = await snapshot(page);
  expect(selected).toMatchObject({
    value: TYPED,
    selectionStart: 0,
    selectionEnd: TYPED.length,
    focused: true,
    hydrated: false,
    registrations: [],
  });
  await hydrate(page);
  const afterHydration = await snapshot(page);
  expect(afterHydration).toMatchObject({ value: TYPED, formValue: TYPED, connected: true });
  await page.keyboard.press("Delete");
  const afterDelete = await snapshot(page);
  const observations = test.info().outputPath("selection-hydration-delete-observations.json");
  await writeFile(
    observations,
    JSON.stringify(
      {
        selected,
        afterHydration,
        afterDelete,
        pageErrors: pageErrors.get(page),
        attemptedRequests: attemptedRequests.get(page),
      },
      null,
      2,
    ),
  );
  await test.info().attach("selection-hydration-delete-observations", {
    contentType: "application/json",
    path: observations,
  });
  // A real failure stays red: diagnostics/regressions do not authorize an app fix.
  expect(afterDelete).toMatchObject({ value: "", formValue: "", connected: true });
  await expectEmptyThroughRerender(page);
});
