#!/usr/bin/env -S bunx vite-node --config vite.config.ts
/**
 * Dependency-light SSR smoke for the Supabase client and classified error HTML.
 *
 * The production server bundle imports application modules in a non-browser
 * runtime. This smoke installs a deliberately hostile partial `window` shim
 * whose sessionStorage getter throws, imports the real client module, checks
 * browser-only OAuth helpers degrade safely, and verifies crawler-safe 500 HTML.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
  const clientModule = await import("../src/integrations/supabase/client.ts");
  assert(clientModule.supabase, "Supabase client module exported no client");

  const oauthModule = await import("../src/lib/mcp/browserOAuthClient.ts");
  assert(oauthModule.hasStoredToken() === false, "SSR OAuth token probe must fail closed");
  oauthModule.disconnect();

  const { SupabaseInitializationError } = await import(
    "../src/lib/supabaseInitializationError.ts"
  );
  const { createSsrErrorResponse } = await import("../src/lib/ssrErrorResponse.ts");

  const classified = createSsrErrorResponse({
    error: new SupabaseInitializationError(new Error("do-not-expose-secret-detail")),
    request: new Request("https://verdantgrowdiary.com/guides/test?token=do-not-log"),
    reference: "ssr-test-ref",
  });
  const classifiedBody = await classified.response.text();

  assert(classified.response.status === 500, "classified SSR response must be HTTP 500");
  assert(
    classified.response.headers.get("content-type")?.includes("text/html"),
    "classified SSR response must be HTML",
  );
  assert(
    classified.response.headers.get("cache-control") === "no-store",
    "classified SSR response must not be cached",
  );
  assert(
    classified.response.headers.get("x-verdant-error-code") === "SUPABASE_INIT_FAILED",
    "classified SSR response must expose the safe Supabase error code",
  );
  assert(
    classified.response.headers.get("x-verdant-error-id") === "ssr-test-ref",
    "classified SSR response must expose the safe reference id",
  );
  assert(
    classifiedBody.includes("Verdant couldn't connect to its data service"),
    "classified SSR response must explain the data-service failure",
  );
  assert(
    classifiedBody.includes("No grow data was changed"),
    "classified SSR response must reassure without claiming success",
  );
  assert(classifiedBody.includes("noindex"), "SSR error HTML must be noindex");
  assert(classifiedBody.includes("ssr-test-ref"), "SSR error HTML must include its reference");
  assert(
    !classifiedBody.includes("do-not-expose-secret-detail") &&
      !classifiedBody.includes("do-not-log"),
    "SSR error HTML must not expose causes or query strings",
  );

  const generic = createSsrErrorResponse({
    error: new Error("generic-private-detail"),
    request: new Request("https://verdantgrowdiary.com/"),
    reference: "ssr-generic-ref",
  });
  const genericBody = await generic.response.text();
  assert(generic.code === "SSR_RENDER_FAILED", "generic error must keep generic classification");
  assert(genericBody.includes("This page didn't load"), "generic error must keep friendly copy");
  assert(!genericBody.includes("generic-private-detail"), "generic cause must stay server-only");

  console.log(
    "Supabase SSR import smoke: PASS — storage, OAuth fallback, and classified error HTML are safe.",
  );
} finally {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
}

// Supabase may schedule browser lifecycle timers when a partial window exists.
// The assertions above are complete; exit explicitly so this smoke stays fast.
process.exit(0);
