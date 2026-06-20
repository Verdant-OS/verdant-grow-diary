import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostGrowReflectionReviewPacket } from "@/lib/ai/postGrowReflectionReviewPacket";
import { buildPostGrowReflectionReviewPacketFilename } from "@/lib/ai/postGrowReflectionReviewPacket";
import { buildReviewPacketJsonText } from "@/lib/ai/postGrowReflectionReviewPacketExport";

type CopyState = "idle" | "copied" | "unavailable";

interface Props {
  packet: PostGrowReflectionReviewPacket;
}

export function PostGrowReflectionReviewPacketCard({ packet }: Props) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  if (packet.status === "idle") return null;

  function handleCopy() {
    const text = buildReviewPacketJsonText(packet);
    if (!navigator.clipboard) {
      setCopyState("unavailable");
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => setCopyState("copied"),
      () => setCopyState("unavailable"),
    );
  }

  function handleDownload() {
    const text = buildReviewPacketJsonText(packet);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildPostGrowReflectionReviewPacketFilename(packet);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasContent = packet.status !== "empty";

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">Operator Review Packet</CardTitle>
          {packet.safetyLabels.map((label) => (
            <Badge key={label} variant="outline" className="text-xs">
              {label}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasContent ? (
          <p className="text-sm text-muted-foreground">No candidate pasted yet.</p>
        ) : (
          <>
            <div className="space-y-1 text-xs">
              <div className="rounded border bg-background/60 p-2">
                {`Outcome — ${packet.outcomeLabel}`}
              </div>
              <div className="rounded border bg-background/60 p-2">
                {`Input kind — ${packet.inputKindLabel}`}
              </div>
              {packet.confidence !== null && (
                <div className="rounded border bg-background/60 p-2">
                  {`Confidence — ${packet.confidence}`}
                </div>
              )}
              {packet.issueCodes.length > 0 && (
                <div className="rounded border bg-background/60 p-2">
                  {`Issue codes — ${packet.issueCodes.join(", ")}`}
                </div>
              )}
              {packet.failureReason !== "none" && (
                <div className="rounded border bg-background/60 p-2">
                  {`Failure reason — ${packet.failureReason}`}
                </div>
              )}
              {packet.validationOptionsLabel !== "not available" && (
                <div className="rounded border bg-background/60 p-2">
                  {`Validation options — ${packet.validationOptionsLabel}`}
                </div>
              )}
              {packet.envelopeSourceLabel !== "not available" && (
                <div className="rounded border bg-background/60 p-2">
                  {`Envelope source — ${packet.envelopeSourceLabel}`}
                </div>
              )}
              {packet.envelopeCandidateFormat !== null && (
                <div className="rounded border bg-background/60 p-2">
                  {`Envelope format — ${packet.envelopeCandidateFormat}`}
                </div>
              )}
              <div className="rounded border bg-background/60 p-2">
                {`Persistence — ${packet.persistenceLabel}`}
              </div>
              <div className="rounded border bg-background/60 p-2">
                {`Runtime — ${packet.runtimeLabel}`}
              </div>
            </div>

            {packet.status === "validated" && packet.sectionSummaries !== null && (
              <div className="space-y-1">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Section summaries
                </div>
                <div className="space-y-1 text-xs">
                  {packet.sectionSummaries.map((section) => (
                    <div key={section.key} className="rounded border bg-background/60 p-2">
                      {section.kind === "list"
                        ? `${section.label} — ${section.itemCount ?? 0} items`
                        : `${section.label} — paragraph ${section.paragraphPresent ? "present" : "absent"}`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                Copy sanitized packet
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                Download sanitized packet
              </Button>
              {copyState === "copied" && (
                <span className="text-xs text-muted-foreground">Copied</span>
              )}
              {copyState === "unavailable" && (
                <span className="text-xs text-muted-foreground">Clipboard not available</span>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Review packet excludes raw candidate content, pasted JSON, credentials, private
              metadata, and device targets.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
