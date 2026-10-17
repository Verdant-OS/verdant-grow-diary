// Run: node --test src/test/grow-targets-native-typing.browser.mjs
// Real native input events on the production editor, with mock I/O and no network.
import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

let browser;
let page;
let bundle;

before(
  async () => {
    const root = process.cwd();
    const mocks = {
      "@/store/auth": `const user = { id: "fixture-user" }; export const useAuth = () => ({ user });`,
      "@/hooks/use-toast": `const toast = () => {}; export const useToast = () => ({ toast });`,
      "@/hooks/useTemperatureUnitPreference": `export const useTemperatureUnitPreference = () => "celsius";`,
      "@/integrations/supabase/client": `
      export const supabase = { from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { temp_min: 20, temp_max: 25, rh_min: 40, rh_max: 60,
            soil_temp_max: 20, ppfd_max: 300 }, error: null
        }) }) }),
        upsert: async (payload) => { window.targetSaves.push(payload); return { error: null }; }
      }) };`,
    };
    const output = await build({
      stdin: {
        contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import GrowTargetsEditor from ${JSON.stringify(resolve(root, "src/components/GrowTargetsEditor.tsx"))};
        window.targetSaves = [];
        function Host() {
          const [open, setOpen] = React.useState(true);
          window.reopenTargets = () => setOpen(true);
          return <GrowTargetsEditor open={open} onOpenChange={setOpen} growId="fixture-grow" />;
        }
        createRoot(document.getElementById("root")).render(<Host />);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
      plugins: [
        {
          name: "isolated-target-editor",
          setup(builder) {
            builder.onResolve({ filter: /^@\// }, async (args) => {
              if (args.path in mocks) return { path: args.path, namespace: "target-mock" };
              return builder.resolve(
                resolve(root, "src", args.path.slice(2)).replaceAll("\\", "/"),
                {
                  kind: args.kind,
                  resolveDir: root,
                },
              );
            });
            builder.onLoad({ filter: /.*/, namespace: "target-mock" }, (args) => ({
              contents: mocks[args.path],
              loader: "js",
            }));
          },
        },
      ],
    });
    bundle = output.outputFiles[0].text;
    browser = await chromium.launch({ headless: true });
  },
  { timeout: 60_000 },
);

after(async () => {
  await browser?.close();
});
beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  await page.route("**/*", (route) => route.abort());
  await page.setContent('<html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Temperature min"]')?.value === "20",
  );
});
afterEach(async () => {
  await page?.close();
});

for (const scenario of [
  { label: "Temperature min", prefix: "-", suffix: "5", text: "-5", column: "temp_min", value: -5 },
  {
    label: "Soil temp max",
    prefix: "-",
    suffix: "5",
    text: "-5",
    column: "soil_temp_max",
    value: -5,
  },
  { label: "Humidity min", prefix: "4e", suffix: "1", text: "4e1", column: "rh_min", value: 40 },
  { label: "PPFD max", prefix: "1e", suffix: "2", text: "1e2", column: "ppfd_max", value: 100 },
]) {
  test(`preserves ${scenario.label} partial typing and saves ${scenario.text}`, async () => {
    const input = page.getByLabel(scenario.label);
    await input.press("ControlOrMeta+A");
    await input.pressSequentially(scenario.prefix, { delay: 40 });
    assert.equal(
      await input.evaluate((el) => el.validity.badInput),
      true,
      "partial native buffer must survive React's render",
    );
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal(await page.getByRole("button", { name: "Save targets" }).isDisabled(), true);
    await input.pressSequentially(scenario.suffix, { delay: 40 });
    assert.equal(await input.inputValue(), scenario.text);
    assert.equal(await input.getAttribute("aria-invalid"), "false");
    await page.getByRole("button", { name: "Save targets" }).click();
    await page.waitForFunction(() => window.targetSaves.length === 1);
    const payload = await page.evaluate(() => window.targetSaves[0]);
    assert.equal(payload[scenario.column], scenario.value);
    assert.equal(payload.grow_id, "fixture-grow");
    assert.equal(payload.user_id, "fixture-user");
  });
}

test("clearing a partial sign restores an optional blank bound", async () => {
  const input = page.getByLabel("Temperature min");
  await input.press("ControlOrMeta+A");
  await input.pressSequentially("-", { delay: 40 });
  await input.press("Backspace");
  assert.equal(await input.inputValue(), "");
  assert.equal(await input.evaluate((el) => el.validity.badInput), false);
  assert.equal(await input.getAttribute("aria-invalid"), "false");
  assert.equal(await page.getByRole("button", { name: "Save targets" }).isDisabled(), false);
  await page.getByRole("button", { name: "Save targets" }).click();
  await page.waitForFunction(() => window.targetSaves.length === 1);
  assert.equal(await page.evaluate(() => window.targetSaves[0].temp_min), null);
});

test("reopening clears invalid native-input state before loading valid targets", async () => {
  const input = page.getByLabel("Temperature min");
  await input.press("ControlOrMeta+A");
  await input.pressSequentially("-", { delay: 40 });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.evaluate(() => window.reopenTargets());
  await page.waitForFunction(
    () => document.querySelector('input[aria-label="Temperature min"]')?.value === "20",
  );
  assert.equal(await page.getByLabel("Temperature min").inputValue(), "20");
  assert.equal(await page.getByLabel("Temperature min").getAttribute("aria-invalid"), "false");
  assert.equal(await page.getByRole("button", { name: "Save targets" }).isDisabled(), false);
  assert.equal(await page.evaluate(() => window.targetSaves.length), 0);
});
