import type { PostGrowReflectionReviewPacket } from "./postGrowReflectionReviewPacket";
import { serializePostGrowReflectionReviewPacket } from "./postGrowReflectionReviewPacket";

export function buildReviewPacketJsonText(packet: PostGrowReflectionReviewPacket): string {
  return serializePostGrowReflectionReviewPacket(packet);
}

export function buildReviewPacketOperatorText(packet: PostGrowReflectionReviewPacket): string {
  const lines: string[] = [
    "Post-Grow Reflection Review Packet",
    `Version: ${packet.packetVersion}`,
    `Outcome: ${packet.outcomeLabel}`,
    `Input kind: ${packet.inputKindLabel}`,
    `Confidence: ${packet.confidence ?? "not validated"}`,
    `Persistence: ${packet.persistenceLabel}`,
    `Runtime: ${packet.runtimeLabel}`,
    `Safety labels: ${packet.safetyLabels.join(", ")}`,
  ];

  if (packet.issueCodes.length > 0) {
    lines.push(`Issue codes: ${packet.issueCodes.join(", ")}`);
  }

  if (packet.failureReason !== "none") {
    lines.push(`Failure reason: ${packet.failureReason}`);
  }

  if (packet.validationOptionsLabel !== "not available") {
    lines.push(`Validation options: ${packet.validationOptionsLabel}`);
  }

  if (packet.envelopeSourceLabel !== "not available") {
    lines.push(`Envelope source: ${packet.envelopeSourceLabel}`);
    if (packet.envelopeCandidateFormat !== null) {
      lines.push(`Envelope format: ${packet.envelopeCandidateFormat}`);
    }
  }

  if (packet.status === "validated" && packet.sectionSummaries !== null) {
    lines.push("Section summaries:");
    for (const section of packet.sectionSummaries) {
      if (section.kind === "list") {
        lines.push(`  ${section.label}: ${section.itemCount ?? 0} items`);
      } else {
        lines.push(
          `  ${section.label}: paragraph ${section.paragraphPresent ? "present" : "absent"}`,
        );
      }
    }
  }

  return lines.join("\n");
}

export function buildReviewPacketDownloadBlob(packet: PostGrowReflectionReviewPacket): Blob {
  return new Blob([buildReviewPacketJsonText(packet)], { type: "application/json" });
}
