import type {
  GgsRealPayloadCommitArgs,
  GgsRealPayloadCommitResult,
} from "@/lib/ggsRealPayloadCommit";

export interface GgsRealPayloadCommitOrchestrationDeps {
  commit: (args: GgsRealPayloadCommitArgs) => Promise<GgsRealPayloadCommitResult>;
  onCommitSuccess?: () => Promise<unknown> | unknown;
}

/**
 * Commit once and refresh Sentinel only after a confirmed success. A refresh
 * failure cannot rewrite an already-confirmed commit into a failed write.
 */
export async function commitGgsRealPayloadAndRefresh(
  args: GgsRealPayloadCommitArgs,
  deps: GgsRealPayloadCommitOrchestrationDeps,
): Promise<GgsRealPayloadCommitResult> {
  const result = await deps.commit(args);
  if (result.ok && deps.onCommitSuccess) {
    try {
      await deps.onCommitSuccess();
    } catch {
      // React Query owns refresh error presentation. The write already
      // succeeded and must not be reported as failed.
    }
  }
  return result;
}
