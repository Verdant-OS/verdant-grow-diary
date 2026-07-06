/**
 * pheno-herm-cull-action-queue-safety
 *
 * The herm → cull suggestion is the ONLY pheno write path into the Action
 * Queue. This scan proves that path stays approval-required and inert:
 *  - INSERT-only into action_queue (no update/upsert/delete/rpc).
 *  - Never sends user_id (DB default auth.uid()) or target_device.
 *  - Uses the pure pending_approval builder; introduces no device/auto-execute
 *    vocabulary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = ["src/lib/phenoActionQueueService.ts", "src/hooks/usePhenoHermCullSuggestion.ts"];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const sources = Object.fromEntries(
  FILES.map((f) => [f, stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))]),
) as Record<string, string>;

describe("pheno herm→cull action queue — write-path safety", () => {
  const svc = sources["src/lib/phenoActionQueueService.ts"];

  it("only INSERTs into action_queue — never update/upsert/delete/rpc", () => {
    for (const [path, src] of Object.entries(sources)) {
      // Any action_queue operation must be an insert.
      const segs = src.split(/\.from\(/);
      for (const seg of segs.slice(1)) {
        const m = seg.match(/^["']([^"']+)["']\)([\s\S]*?)(?=\.from\(|$)/);
        if (m && m[1] === "action_queue") {
          expect(m[2], `${path} action_queue op`).not.toMatch(/\.(update|upsert|delete)\(/);
        }
      }
      expect(src, path).not.toMatch(/\.rpc\(/);
    }
  });

  it("never sends user_id or target_device on the queued row", () => {
    expect(svc).not.toMatch(/user_id\s*:/);
    expect(svc).not.toMatch(/target_device/);
  });

  it("builds the payload only via the pure pending_approval builder", () => {
    expect(svc).toMatch(/buildPhenoKeeperActionQueuePayloads/);
    // Never hard-codes an approved/executed status here.
    expect(svc).not.toMatch(/status\s*:\s*["'](approved|executed|completed|simulated)["']/i);
  });

  it("carries no device-control / auto-execute vocabulary", () => {
    for (const [path, src] of Object.entries(sources)) {
      const lower = src.toLowerCase();
      expect(lower, path).not.toMatch(
        /device[_-]?control|device_command|autopilot|target_device|actuator|\bmqtt\b|dispatch_command/,
      );
      expect(lower, path).not.toMatch(/\bauto[-_ ]?execute\b|\bauto[-_ ]?approve\b/);
      expect(lower, path).not.toMatch(/service[_-]?role/);
    }
  });
});
