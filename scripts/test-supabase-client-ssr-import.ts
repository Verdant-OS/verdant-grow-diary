#!/usr/bin/env -S bunx vite-node --config vite.config.ts
/**
 * Dependency-light SSR import smoke for the generated Supabase browser client.
 *
 * The production server bundle imports application modules in a non-browser
 * runtime. This smoke installs a deliberately hostile partial `window` shim
 * whose sessionStorage getter throws, then imports the real client module.
 * A browser-global read during module evaluation exits non-zero.
 */

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const partialWindow = {} as { sessionStorage: Storage };
Object.defineProperty(partialWindow, "sessionStorage", {
  configurable: true,
  get() {
    throw new Error("SSR import evaluated window.sessionStorage");
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: partialWindow,
});

try {
  const module = await import("../src/integrations/supabase/client.ts");
  if (!module.supabase) {
    throw new Error("Supabase client module imported without exporting a client");
  }
  console.log("Supabase SSR import smoke: PASS — no browser storage evaluated at import time.");
} finally {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}
