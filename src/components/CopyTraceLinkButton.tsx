/**
 * CopyTraceLinkButton — small presenter that copies a safe Action
 * Queue trace link to the clipboard. Used by diary timeline trace
 * entries and the Action Queue drawer.
 *
 * Presenter-only:
 *  - No Supabase, no AI calls, no device control.
 *  - The clipboard is the only side-effect.
 *  - Never renders raw UUIDs / internal IDs / secrets.
 *  - Calm fallback copy on failure; never crashes.
 */
import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import {
  COPY_TRACE_LINK_LABEL,
  COPY_TRACE_LINK_SUCCESS_COPY,
  COPY_TRACE_LINK_FAILURE_COPY,
  COPY_TRACE_LINK_TESTID,
  COPY_TRACE_LINK_STATUS_TESTID,
  copyTraceLinkToClipboard,
  type CopyTraceLinkResult,
} from "@/lib/actionQueueTraceLinkCopyRules";

export interface CopyTraceLinkButtonProps {
  url: string;
  /** Override identifier for tests when multiple are on a page. */
  testIdSuffix?: string;
  /** Inject clipboard for tests. Defaults to navigator.clipboard. */
  clipboard?: { writeText: (value: string) => Promise<void> } | null;
}

export default function CopyTraceLinkButton({
  url,
  testIdSuffix,
  clipboard,
}: CopyTraceLinkButtonProps) {
  const [status, setStatus] = useState<CopyTraceLinkResult | "idle">("idle");
  const [busy, setBusy] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const buttonTestId = testIdSuffix
    ? `${COPY_TRACE_LINK_TESTID}-${testIdSuffix}`
    : COPY_TRACE_LINK_TESTID;
  const statusTestId = testIdSuffix
    ? `${COPY_TRACE_LINK_STATUS_TESTID}-${testIdSuffix}`
    : COPY_TRACE_LINK_STATUS_TESTID;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resetTimeoutRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
    };
  }, []);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const result = await copyTraceLinkToClipboard(url, clipboard ?? undefined);
    if (!mountedRef.current) return;
    setStatus(result);
    setBusy(false);
    if (typeof window !== "undefined") {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = window.setTimeout(() => {
        resetTimeoutRef.current = null;
        if (mountedRef.current) setStatus("idle");
      }, 2500);
    }
  };

  const message =
    status === "success"
      ? COPY_TRACE_LINK_SUCCESS_COPY
      : status === "failure"
        ? COPY_TRACE_LINK_FAILURE_COPY
        : "";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        data-testid={buttonTestId}
        data-copy-state={status}
        aria-label={COPY_TRACE_LINK_LABEL}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm disabled:opacity-60"
      >
        <Copy className="h-3 w-3" aria-hidden />
        {COPY_TRACE_LINK_LABEL}
      </button>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid={statusTestId}
      >
        {message}
      </span>
      {status !== "idle" && (
        <span
          aria-hidden
          data-testid={`${statusTestId}-visible`}
          className={
            status === "success"
              ? "text-xs text-success"
              : "text-xs text-destructive"
          }
        >
          {message}
        </span>
      )}
    </span>
  );
}
