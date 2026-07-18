import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import { trackQuickLogSuccess, type QuickLogSuccessInput } from "@/lib/quickLogSuccessTelemetry";

export interface QuickLogV2SaveResult {
  ok: boolean;
  reason?: string;
  growEventId?: string | null;
  environmentEventId?: string | null;
  reused?: boolean;
}

interface RpcResponse {
  ok?: boolean;
  reason?: string;
  grow_event_id?: string | null;
  environment_event_id?: string | null;
  reused?: boolean;
}

export interface QuickLogV2SaveOptions {
  /**
   * Explicit, closed grower Quick Log intent. Omit for adapters and other
   * workflows that reuse this persistence hook without representing a
   * grower-authored Quick Log activation.
   */
  telemetryIntent?: QuickLogSuccessInput;
}

export function useQuickLogV2Save() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (
      payload: QuickLogV2SavePayload,
      options: QuickLogV2SaveOptions = {},
    ): Promise<QuickLogV2SaveResult> => {
      setSaving(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "quicklog_save_manual" as any,
          payload as unknown as Record<string, unknown>,
        );
        if (rpcError) {
          setError("save_failed");
          return { ok: false, reason: "save_failed" };
        }
        const r = (data ?? {}) as RpcResponse;
        if (!r.ok) {
          const reason = r.reason || "save_failed";
          setError(reason);
          return { ok: false, reason };
        }
        if (options.telemetryIntent !== undefined) {
          trackQuickLogSuccess(options.telemetryIntent, { reused: r.reused === true });
        }
        return {
          ok: true,
          growEventId: r.grow_event_id ?? null,
          environmentEventId: r.environment_event_id ?? null,
          reused: r.reused === true,
        };
      } catch {
        setError("save_failed");
        return { ok: false, reason: "save_failed" };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving, error };
}
