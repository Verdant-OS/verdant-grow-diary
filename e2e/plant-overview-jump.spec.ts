import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { expect, test } from "@playwright/test";

// Credential-free code validation, not production acceptance. Build the real
// nav/coordinator into an isolated fixture; never connect to Supabase.
let server: Server;
let fixtureUrl: string;

test.beforeAll(async () => {
  const root = resolve(import.meta.dirname, "..");
  const bundle = await build({
    entryPoints: [resolve(root, "e2e/fixtures/plant-overview-jump.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@/lib/react-router-compat": resolve(root, "src/test/helpers/reactRouterCompat.vitest.tsx"),
      "@": resolve(root, "src"),
    },
  });
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { margin: 0; font-family: sans-serif; }
      header { position: sticky; top: 0; height: 64px; background: white; z-index: 1; }
      .lead-in { height: 400px; }
      nav { min-height: 100px; }
      button { min-height: 44px; padding: 8px; }
      section { scroll-margin-top: 64px; min-height: 200px; }
      h2 { margin: 0; }
      .overview-content { height: 4800px; }
      .tail { height: 1000px; }
      @media (max-width: 600px) { .overview-content { height: 6400px; } }
    </style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`;
  server = createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/fixture.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/fixture.js" ? bundle.outputFiles[0].text : html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no port");
  fixtureUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px Overview landing`, () => {
    test.use({ viewport });

    for (const hash of ["", "#plant-ai-doctor-review"]) {
      test(`keeps Overview's start below the header${hash ? " after a hash landing" : " on a fresh load"}`, async ({
        page,
      }) => {
        await page.goto(`${fixtureUrl}/${hash}`);
        const overview = page.locator("#plant-overview");
        for (let attempt = 0; attempt < 2; attempt++) {
          await page.getByRole("button", { name: "Jump to Overview section", exact: true }).click();
          await expect(overview).toBeFocused();
          await expect.poll(async () => (await overview.boundingBox())?.y).toBeCloseTo(64, 0);
          // Growth *inside* Overview must not recenter its now-taller region or
          // revive the previous hash's ResizeObserver follow.
          await page.locator(".overview-content").evaluate((node) => {
            (node as HTMLElement).style.height = `${(node as HTMLElement).offsetHeight + 800}px`;
          });
          await page.evaluate(
            () =>
              new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
              }),
          );
          await expect.poll(async () => (await overview.boundingBox())?.y).toBeCloseTo(64, 0);
          await expect(overview).toBeFocused();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
      });
    }

    test("keeps the other section links centered and focusable", async ({ page }) => {
      await page.goto(fixtureUrl);
      for (const [label, id] of [
        ["Timeline", "plant-relative-timeline"],
        ["Alerts", "plant-alerts"],
        ["Actions", "plant-actions"],
        ["Doctor", "plant-doctor"],
      ]) {
        await page.getByRole("button", { name: `Jump to ${label} section`, exact: true }).click();
        const target = page.locator(`#${id}`);
        await expect(target).toBeFocused();
        // Center alignment includes the 64px scroll-margin above the target.
        await expect
          .poll(async () => {
            const box = await target.boundingBox();
            return box ? box.y + box.height / 2 - 32 : null;
          })
          .toBeCloseTo(viewport.height / 2, 0);
      }
    });
  });
}
