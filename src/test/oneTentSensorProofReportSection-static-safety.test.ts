/**
 * Static-safety: One-Tent sensor-proof report markdown must never leak
 * UUID-shaped identifiers or second-precision ISO timestamps from input
 * audit rows, even when those values are present on the upstream VMs.
 *
 * Read-only test. Pure function inputs. No I/O, no Supabase, no AI.
 */
import { describe, it, expect } from "vitest";
import {
  buildOneTentSensorProofViewModel,
  buildOneTentSensorProofReportSection,
} from "@/lib/oneTentSensorProofViewModel";
import { buildEcowittIngestAuditProof } from "@/lib/ecowittIngestAuditProofRules";

const UUID_RE =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
// ISO timestamps with second precision: 2025-01-15T11:00:00Z etc.
const ISO_SECOND_RE =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/;

const TENT = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-01-15T12:00:00Z");

describe("oneTentSensorProofReportSection static-safety", () => {
  it("does not leak UUIDs or ISO-second timestamps when audit rows are loaded", () => {
    const auditVM = buildEcowittIngestAuditProof(
      [
        {
          source: "ecowitt",
          tent_id: TENT,
          rows_received: 10,
          rows_inserted: 7,
          captured_at: "2025-01-15T11:00:00Z",
          created_at: "2025-01-15T11:00:00Z",
        },
      ],
      { status: "loaded", tentId: TENT, now: NOW },
    );
    const vm = buildOneTentSensorProofViewModel({
      tentId: TENT,
      liveProof: null,
      auditProof: auditVM,
    });
    const md = buildOneTentSensorProofReportSection(vm);
    expect(md).not.toMatch(UUID_RE);
    expect(md).not.toMatch(ISO_SECOND_RE);
    expect(md).not.toContain(TENT);
  });

  it("does not leak identifiers across blocked, error, empty, and no-tent paths", () => {
    const variants = [
      buildOneTentSensorProofViewModel({
        tentId: TENT,
        liveProof: null,
        auditProof: buildEcowittIngestAuditProof([], {
          status: "blocked",
          tentId: TENT,
          now: NOW,
        }),
      }),
      buildOneTentSensorProofViewModel({
        tentId: TENT,
        liveProof: null,
        auditProof: buildEcowittIngestAuditProof([], {
          status: "error",
          tentId: TENT,
          now: NOW,
        }),
      }),
      buildOneTentSensorProofViewModel({
        tentId: TENT,
        liveProof: null,
        auditProof: buildEcowittIngestAuditProof([], {
          status: "loaded",
          tentId: TENT,
          now: NOW,
        }),
      }),
      buildOneTentSensorProofViewModel({
        tentId: null,
        liveProof: null,
        auditProof: null,
      }),
    ];
    for (const vm of variants) {
      const md = buildOneTentSensorProofReportSection(vm);
      expect(md).not.toMatch(UUID_RE);
      expect(md).not.toMatch(ISO_SECOND_RE);
      expect(md).not.toContain(TENT);
    }
  });
});
