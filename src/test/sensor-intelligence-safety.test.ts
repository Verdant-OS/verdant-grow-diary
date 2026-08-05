import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { installScannerGuardrail } from "./support/scannerGuardrailHarness";
import { scanContent } from "../../scripts/assert-sensor-intelligence-safety.mjs";

installScannerGuardrail({ file: __filename });

const scannerPath = resolve(process.cwd(), "scripts/assert-sensor-intelligence-safety.mjs");

describe("sensor intelligence safety scanner", () => {
  it("exempts only a server-named source module from frontend-secret checks", () => {
    const serverOnly = scanContent(
      "src/integrations/supabase/client.server.ts",
      "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    );
    const client = scanContent(
      "src/integrations/supabase/client.ts",
      "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    );

    expect(serverOnly).toEqual([]);
    expect(client).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "frontend-private-term",
          term: "SUPABASE_SERVICE_ROLE_KEY",
        }),
      ]),
    );
  });

  it("current repository is clean", () => {
    expect(() =>
      execFileSync(process.execPath, [scannerPath, "--quiet"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
