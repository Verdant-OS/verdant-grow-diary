/**
 * useActionResponseMemory — read-only hook for canonical Action Response
 * Memories (Milestone 5). Auth-gated, owner-scoped via the authenticated
 * client's RLS. Explicit loading / ready / empty / unavailable states; a
 * query failure resolves to "unavailable" without erasing any other surface
 * content. No writes, no mock fallback — honest empty, never demo rows.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import {
  loadActionResponseMemories,
} from "@/lib/actionResponseMemoryService";
import type { ActionResponseMemory } from "@/lib/actionResponseMemoryRules";

export type ActionResponseMemoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; memories: ActionResponseMemory[] }
  | { status: "unavailable" };

export interface UseActionResponseMemoryArgs {
  readonly growId: string | null | undefined;
  readonly plantId?: string | null;
}

export function useActionResponseMemory(
  args: UseActionResponseMemoryArgs,
): { state: ActionResponseMemoryState; reload: () => void } {
  const { user } = useAuth();
  const [state, setState] = useState<ActionResponseMemoryState>({ status: "idle" });
  const [nonce, setNonce] = useState(0);
  const growId = args.growId ?? null;
  const plantId = args.plantId ?? null;

  useEffect(() => {
    if (!user || !growId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      const result = await loadActionResponseMemories({ growId, plantId });
      if (cancelled) return;
      if (result.status === "ok") {
        setState({ status: "ok", memories: result.memories });
      } else {
        setState({ status: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, growId, plantId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { state, reload };
}
