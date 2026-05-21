/**
 * Disabled-by-default seam for the watering-only typed event write path.
 *
 * This module is intentionally NOT imported by QuickLog or any UI. It exists
 * so the future runtime wiring of `create_watering_event` can be reviewed,
 * tested, and flipped on behind `typedWateringWriteEnabled` without further
 * refactors.
 *
 * Hard rules while `typedWateringWriteEnabled === false`:
 *   - never call Supabase
 *   - never invoke the RPC
 *   - return a structured "skipped" result so callers can branch deterministically
 *
 * When the flag eventually flips to `true`, this helper will:
 *   1. Validate the QuickLog input via `quickLogToTypedEventPayload`
 *   2. Refuse non-watering payloads via `getTypedEventWriteReadiness`
 *   3. Map the validated payload via `mapWateringPayloadToCreateWateringEventArgs`
 *   4. Call `supabase.rpc('create_watering_event', args)`
 *
 * Until then, all of those steps are inert. No `supabase` import is added
 * here on purpose — adding it later is a deliberate, reviewable step.
 */

import { typedWateringWriteEnabled } from "./featureFlags";
import {
  type TypedEventKind,
  getTypedEventWriteReadiness,
  mapWateringPayloadToCreateWateringEventArgs,
  quickLogToTypedEventPayload,
} from "./quickLogTypedEventPayloadRules";

export type TypedWateringWriteOutcome =
  | {
      ok: false;
      status: "disabled";
      reason: "feature_flag_off";
    }
  | {
      ok: false;
      status: "unsupported_event_type";
      reason: string;
    }
  | {
      ok: false;
      status: "invalid_payload";
      reason: string;
      warnings: string[];
    }
  | {
      ok: true;
      status: "would_write";
      /** RPC name that would be invoked if the flag were on. */
      rpc: "create_watering_event";
      /** Args object that would be passed to the RPC. */
      args: ReturnType<typeof mapWateringPayloadToCreateWateringEventArgs>;
      warnings: string[];
    };

export interface WriteWateringTypedEventInput {
  kind: TypedEventKind;
  // Mirrors the QuickLog adapter input shape; kept loose on purpose so the
  // adapter remains the single source of truth for validation.
  input: Parameters<typeof quickLogToTypedEventPayload>[0];
}

/**
 * Disabled-by-default helper.
 *
 * While `typedWateringWriteEnabled` is `false` this function performs no
 * Supabase work and returns `{ ok: false, status: 'disabled' }` immediately.
 *
 * The dry-run validation branches below are unreachable today and exist only
 * so that flipping the flag in the future does not require restructuring the
 * call site contract.
 */
export function writeWateringTypedEvent(
  args: WriteWateringTypedEventInput,
): TypedWateringWriteOutcome {
  // Hard short-circuit. Must remain the very first statement so any future
  // refactor cannot accidentally hit Supabase while the flag is off.
  if (!typedWateringWriteEnabled) {
    return { ok: false, status: "disabled", reason: "feature_flag_off" };
  }

  // The branches below are dead code while the flag is `false`. They are kept
  // here as a reviewable contract for the eventual enable step. They do not
  // import or call Supabase.
  const readiness = getTypedEventWriteReadiness(args.kind);
  if (readiness !== "rpc_available") {
    return {
      ok: false,
      status: "unsupported_event_type",
      reason: `no atomic RPC available for event kind "${args.kind}"`,
    };
  }

  const adapted = quickLogToTypedEventPayload(args.input);
  if (adapted.ok !== true) {
    return {
      ok: false,
      status: "invalid_payload",
      reason: adapted.reason,
      warnings: adapted.warnings,
    };
  }

  const rpcArgs = mapWateringPayloadToCreateWateringEventArgs(adapted);

  // Intentionally NOT calling supabase.rpc here. Wiring the actual call is
  // a separate, gated change that requires the live RLS checklist to be
  // signed off first.
  return {
    ok: true,
    status: "would_write",
    rpc: "create_watering_event",
    args: rpcArgs,
    warnings: adapted.warnings,
  };
}
