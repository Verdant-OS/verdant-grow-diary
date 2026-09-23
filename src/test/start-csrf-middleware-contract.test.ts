/**
 * Architecture contract AC-1.5 / gate T8 — server functions stay CSRF-protected only
 * when `src/start.ts` registers `createCsrfMiddleware` on `requestMiddleware`.
 */
import { describe, expect, it } from "vitest";

const CSRF_MIDDLEWARE = Symbol.for("tanstack-start:csrf-middleware");

describe("start CSRF middleware contract", () => {
  it("registers tagged CSRF middleware ahead of server function handling", async () => {
    const { startInstance } = await import("@/start");
    const options = await startInstance.getOptions();
    const chain = options.requestMiddleware ?? [];

    expect(chain.length).toBeGreaterThanOrEqual(2);

    const csrfEntries = chain.filter((entry) => CSRF_MIDDLEWARE in (entry as object));
    expect(csrfEntries.length).toBe(1);
  });

  it("keeps Supabase auth on function middleware", async () => {
    const { startInstance } = await import("@/start");
    const options = await startInstance.getOptions();
    expect(options.functionMiddleware?.length).toBeGreaterThan(0);
  });
});
