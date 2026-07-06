/**
 * ManifestSummaryModal — safe "View MCP manifest" modal.
 *
 * Renders ONLY the safe manifest projection (server identity, version,
 * fingerprint, tool names + params). Never shows tokens, secrets, OAuth
 * credentials, or private env values.
 */
import { useCallback, useMemo, useState, type RefObject } from "react";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildSafeManifestSummaryText, type MCPManifestView } from "@/lib/mcp/manifestView";

type ModalCopyState = "idle" | "copied" | "failed";

export type ManifestSummaryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: MCPManifestView;
  fingerprint: string;
  manifestUrl?: string;
  /**
   * Element to return keyboard focus to when the modal closes. This
   * dialog is controlled externally (no Radix DialogTrigger), so Radix
   * has no trigger to restore focus to on its own — without this, focus
   * falls to <body> on close (a WCAG 2.4.3 focus-order gap). Point this
   * at whichever button opened the modal.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export default function ManifestSummaryModal({
  open,
  onOpenChange,
  manifest,
  fingerprint,
  manifestUrl,
  returnFocusRef,
}: ManifestSummaryModalProps) {
  const [copyState, setCopyState] = useState<ModalCopyState>("idle");
  const summaryText = useMemo(
    () => buildSafeManifestSummaryText(manifest, fingerprint, manifestUrl),
    [manifest, fingerprint, manifestUrl],
  );

  const onCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summaryText);
        setCopyState("copied");
        return;
      }
      setCopyState("failed");
    } catch {
      setCopyState("failed");
    }
  }, [summaryText]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setCopyState("idle");
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="max-w-lg"
        data-testid="manifest-summary-modal"
        onCloseAutoFocus={(e) => {
          // Return focus to the opening trigger when provided. Radix
          // cannot do this for an externally-controlled dialog with no
          // DialogTrigger, so we take over focus restoration here.
          const target = returnFocusRef?.current;
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle data-testid="manifest-summary-title">Safe MCP manifest summary</DialogTitle>
          <DialogDescription>
            Public metadata only. This view does not include tokens, secrets, OAuth credentials, or
            private environment values.
          </DialogDescription>
        </DialogHeader>

        <div
          className="max-h-[60vh] overflow-y-auto space-y-3 text-sm"
          data-testid="manifest-summary-body"
        >
          <dl className="space-y-1">
            <div>
              <dt className="inline text-muted-foreground">Server: </dt>
              <dd className="inline font-mono text-xs">
                {manifest.serverTitle} ({manifest.serverName})
              </dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Version: </dt>
              <dd className="inline font-mono text-xs">{manifest.version}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Fingerprint: </dt>
              <dd className="inline font-mono text-xs" data-testid="manifest-summary-fingerprint">
                {fingerprint}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Path: </dt>
              <dd className="inline font-mono text-xs">{manifest.path}</dd>
            </div>
            {manifestUrl ? (
              <div>
                <dt className="inline text-muted-foreground">Manifest: </dt>
                <dd className="inline break-all font-mono text-xs">{manifestUrl}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-muted-foreground">Tools advertised: </dt>
              <dd className="inline" data-testid="manifest-summary-tool-count">
                {manifest.tools.length}
              </dd>
            </div>
          </dl>

          <ul className="space-y-2">
            {manifest.tools.map((tool) => (
              <li
                key={tool.name}
                className="rounded-md border p-2"
                data-testid={`manifest-summary-tool-${tool.name}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-xs">{tool.name}</code>
                  {tool.readOnly ? (
                    <Badge variant="outline" className="text-[10px]">
                      read-only
                    </Badge>
                  ) : null}
                </div>
                {tool.params.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {tool.params.map((p) => (
                      <li key={p.name} className="font-mono">
                        {p.name}: {p.type}{" "}
                        <span className={p.required ? "text-primary" : "text-muted-foreground"}>
                          ({p.required ? "required" : "optional"})
                        </span>
                        {p.constraints ? (
                          <span className="text-muted-foreground"> [{p.constraints}]</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">No parameters.</p>
                )}
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground" data-testid="manifest-summary-safety-note">
            This is a safe manifest summary. It does not include tokens, secrets, OAuth credentials,
            or private environment values.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onCopy}
            aria-label="Copy safe MCP manifest summary"
            data-testid="manifest-summary-copy"
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden />
            Copy safe manifest summary
          </Button>
          <DialogClose asChild>
            <Button
              variant="ghost"
              aria-label="Close MCP manifest summary"
              data-testid="manifest-summary-close"
            >
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-muted-foreground"
          data-testid="manifest-summary-copy-status"
        >
          {copyState === "copied"
            ? "Copied — safe manifest summary."
            : copyState === "failed"
              ? "Copy failed — please copy manually."
              : ""}
        </p>
      </DialogContent>
    </Dialog>
  );
}
