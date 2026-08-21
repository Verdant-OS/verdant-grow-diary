/**
 * One-Tent Loop interaction counter — Tranche B+ PR-B0a measurement layer.
 *
 * Pure counting plus a deterministic one-line receipt, mirroring the
 * oneTentBrowserProofReceipt contract: no I/O, no clocks, no randomness, no
 * identifiers. Counts are driver-level by construction — the Playwright spec
 * increments the counter exactly once per deliberate action it performs, so
 * receipts never depend on browser-synthesized event storms.
 *
 * Counting rules (fixed in docs/one-tent-loop-efficiency-baseline.md §1):
 * one deliberate tap/click = one click; one required free-text entry = one
 * fill; one deliberate key activation = one keypress; re-picking a target
 * the app already knew = one reselection; a full route navigation = one
 * transition. Supabase writes are counted at the network seam (route stubs),
 * split into REST verbs and per-RPC-name tallies.
 */

export const INTERACTION_RECEIPT_PREFIX = "ONE_TENT_INTERACTION_COUNT_JSON=";

export interface SupabaseWriteCounts {
  rest_post: number;
  rest_patch: number;
  rest_delete: number;
  rpc: Record<string, number>;
}

export interface InteractionCountReceipt {
  schema_version: "1";
  scenario: string;
  status: "measured";
  clicks: number;
  fills: number;
  keypresses: number;
  target_reselections: number;
  route_transitions: number;
  supabase_writes: SupabaseWriteCounts;
  paid_ai_requests: number;
}

export type RestWriteVerb = "POST" | "PATCH" | "DELETE";

export interface InteractionCounter {
  recordClick(): void;
  recordFill(): void;
  recordKeypress(): void;
  recordReselection(): void;
  recordRouteTransition(): void;
  recordRpc(rpcName: string): void;
  recordRestWrite(verb: RestWriteVerb): void;
  recordPaidAiRequest(): void;
  snapshot(): InteractionCountReceipt;
}

const REST_WRITE_VERBS: readonly RestWriteVerb[] = ["POST", "PATCH", "DELETE"];

export function createInteractionCounter(scenario: string): InteractionCounter {
  const name = typeof scenario === "string" ? scenario.trim() : "";
  if (name.length === 0) {
    throw new TypeError("interaction counter requires a non-empty scenario name");
  }

  let clicks = 0;
  let fills = 0;
  let keypresses = 0;
  let reselections = 0;
  let routeTransitions = 0;
  let restPost = 0;
  let restPatch = 0;
  let restDelete = 0;
  let paidAiRequests = 0;
  const rpc = new Map<string, number>();

  return {
    recordClick() {
      clicks += 1;
    },
    recordFill() {
      fills += 1;
    },
    recordKeypress() {
      keypresses += 1;
    },
    recordReselection() {
      reselections += 1;
    },
    recordRouteTransition() {
      routeTransitions += 1;
    },
    recordRpc(rpcName: string) {
      const key = typeof rpcName === "string" ? rpcName.trim() : "";
      if (key.length === 0) {
        throw new TypeError("recordRpc requires a non-empty rpc name");
      }
      rpc.set(key, (rpc.get(key) ?? 0) + 1);
    },
    recordRestWrite(verb: RestWriteVerb) {
      if (!REST_WRITE_VERBS.includes(verb)) {
        throw new TypeError(`recordRestWrite only accepts ${REST_WRITE_VERBS.join("/")}`);
      }
      if (verb === "POST") restPost += 1;
      else if (verb === "PATCH") restPatch += 1;
      else restDelete += 1;
    },
    recordPaidAiRequest() {
      paidAiRequests += 1;
    },
    snapshot(): InteractionCountReceipt {
      const sortedRpc: Record<string, number> = {};
      for (const key of [...rpc.keys()].sort()) {
        sortedRpc[key] = rpc.get(key) ?? 0;
      }
      return {
        schema_version: "1",
        scenario: name,
        status: "measured",
        clicks,
        fills,
        keypresses,
        target_reselections: reselections,
        route_transitions: routeTransitions,
        supabase_writes: {
          rest_post: restPost,
          rest_patch: restPatch,
          rest_delete: restDelete,
          rpc: sortedRpc,
        },
        paid_ai_requests: paidAiRequests,
      };
    },
  };
}

/**
 * Deterministic single-line serialization. Key order is fixed by receipt
 * construction (JSON.stringify preserves string-key insertion order) and the
 * rpc record is pre-sorted, so identical measurements are byte-identical.
 */
export function serializeInteractionCountReceipt(receipt: InteractionCountReceipt): string {
  return `${INTERACTION_RECEIPT_PREFIX}${JSON.stringify(receipt)}`;
}
