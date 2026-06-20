/**
 * AI Doctor Phase 1 — Internal Link (read-only).
 *
 * Renders the internal deep link to /operator/ai-doctor-phase1?plantId=...
 * with optional growId/tentId. Offers Copy-to-clipboard when the browser
 * Clipboard API is available; otherwise the link text is selectable so it
 * can be copied manually. No fetch, no Supabase, no mutations.
 */
import * as React from "react";

export interface AiDoctorPhase1InternalLinkProps {
  plantId: string;
  growId?: string | null;
  tentId?: string | null;
}

export function buildAiDoctorPhase1InternalLink(input: {
  plantId: string;
  growId?: string | null;
  tentId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("plantId", input.plantId);
  if (input.growId) params.set("growId", input.growId);
  if (input.tentId) params.set("tentId", input.tentId);
  return `/operator/ai-doctor-phase1?${params.toString()}`;
}

export function AiDoctorPhase1InternalLink(
  props: AiDoctorPhase1InternalLinkProps,
): JSX.Element {
  const href = buildAiDoctorPhase1InternalLink(props);
  const [copied, setCopied] = React.useState<"idle" | "ok" | "unavailable">("idle");

  const clipboard =
    typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  const canCopy = typeof clipboard?.writeText === "function";

  const onCopy = React.useCallback(async () => {
    if (!canCopy) {
      setCopied("unavailable");
      return;
    }
    try {
      await clipboard!.writeText(href);
      setCopied("ok");
    } catch {
      setCopied("unavailable");
    }
  }, [canCopy, clipboard, href]);

  return (
    <section
      data-testid="ai-doctor-phase1-internal-link"
      className="rounded-md border border-border bg-card p-3 text-xs"
    >
      <div className="font-medium text-foreground">Internal link</div>
      <div className="text-muted-foreground">Read-only result view</div>
      <code
        data-testid="ai-doctor-phase1-internal-link-href"
        className="mt-1 block break-all rounded bg-muted px-2 py-1 text-foreground"
      >
        {href}
      </code>
      {canCopy ? (
        <button
          type="button"
          data-testid="ai-doctor-phase1-internal-link-copy"
          onClick={onCopy}
          className="mt-2 rounded-md border border-border bg-secondary px-3 py-1 text-secondary-foreground"
        >
          Copy internal link
        </button>
      ) : (
        <p
          data-testid="ai-doctor-phase1-internal-link-manual-copy"
          className="mt-2 text-muted-foreground"
        >
          Clipboard unavailable — copy the link text above.
        </p>
      )}
      {copied === "ok" && (
        <span
          data-testid="ai-doctor-phase1-internal-link-copied"
          className="ml-2 text-muted-foreground"
        >
          Copied!
        </span>
      )}
      {copied === "unavailable" && (
        <span
          data-testid="ai-doctor-phase1-internal-link-copy-unavailable"
          className="ml-2 text-muted-foreground"
        >
          Copy failed — please copy manually.
        </span>
      )}
    </section>
  );
}
