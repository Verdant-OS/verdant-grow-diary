import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PostGrowReflectionReviewPacketCard } from "@/components/PostGrowReflectionReviewPacketCard";
import {
  validatePostGrowReflectionCandidatePaste,
  type PostGrowReflectionCandidatePasteResult,
} from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
import {
  buildPostGrowReflectionCandidateValidationSummary,
  type PostGrowReflectionCandidateValidationSummary,
} from "@/lib/ai/postGrowReflectionCandidateValidationSummary";
import { findPostGrowReflectionEnvelopeSample } from "@/lib/ai/postGrowReflectionEnvelopeSamples";
import { buildPostGrowReflectionReviewPacket } from "@/lib/ai/postGrowReflectionReviewPacket";
import type { PostGrowReflectionPreviewSectionRow } from "@/lib/ai/postGrowReflectionPreviewViewModel";

function SectionBlock({ section }: { section: PostGrowReflectionPreviewSectionRow }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{section.label}</div>
      {section.kind === "paragraph" ? (
        <p className="mt-2 text-sm">{section.paragraph}</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {(section.items ?? []).map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EnvelopeMetadata({ result }: { result: PostGrowReflectionCandidatePasteResult }) {
  if (
    (result.status !== "validated" && result.status !== "validation_failed") ||
    !result.envelopeMetadata
  ) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">Envelope metadata</div>
      <p className="mt-1 text-xs text-muted-foreground">{result.envelopeMetadata.label}</p>
    </div>
  );
}

function ValidationSummaryPanel({
  summary,
}: {
  summary: PostGrowReflectionCandidateValidationSummary;
}) {
  if (summary.status === "idle" || summary.status === "empty") return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">{summary.title}</div>
        <Badge variant="outline">{summary.outcomeLabel}</Badge>
        <Badge variant="outline">{summary.inputKindLabel}</Badge>
        <Badge variant="outline">Not saved</Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
        {summary.rows.map((row) => (
          <div key={row.label} className="rounded border bg-background/60 p-2">
            <dt className="font-medium text-muted-foreground">{row.label}</dt>
            <dd className="mt-1 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{summary.note}</p>
    </div>
  );
}

function ResultPanel({ result }: { result: PostGrowReflectionCandidatePasteResult }) {
  if (result.status === "idle" || result.status === "empty") {
    return <p className="text-sm text-muted-foreground">{result.message}</p>;
  }

  if (result.status === "invalid_json") {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <div className="text-sm font-medium">Invalid JSON</div>
        <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">{result.parseError}</p>
      </div>
    );
  }

  if (result.status === "envelope_rejected") {
    return (
      <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">Rejected candidate</Badge>
          {result.labels.map((label) => (
            <Badge key={label.key} variant="outline">
              {label.text}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <div className="text-sm">
          <span className="font-medium">Issue codes: </span>
          {result.issueCodes.length > 0 ? result.issueCodes.join(", ") : "none"}
        </div>
        <div className="text-sm">
          <span className="font-medium">Failure reason: </span>
          {result.failureReason}
        </div>
      </div>
    );
  }

  if (result.status === "validation_failed") {
    return (
      <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive">Rejected candidate</Badge>
          {result.labels.map((label) => (
            <Badge key={label.key} variant="outline">
              {label.text}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <div className="text-sm">
          <span className="font-medium">Issue codes: </span>
          {result.issueCodes.length > 0 ? result.issueCodes.join(", ") : "none"}
        </div>
        <div className="text-sm">
          <span className="font-medium">Failure reason: </span>
          <span>{result.failureReason}</span>
        </div>
        <EnvelopeMetadata result={result} />
        <p className="text-xs text-muted-foreground">{result.validationOptions.label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {result.labels.map((label) => (
          <Badge key={label.key} variant="outline">
            {label.text}
          </Badge>
        ))}
        <Badge variant="secondary">{result.confidenceLabel}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{result.message}</p>
      <EnvelopeMetadata result={result} />
      <div className="grid gap-3">
        {result.sections.map((section) => (
          <SectionBlock key={section.key} section={section} />
        ))}
      </div>
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Validation options
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{result.validationOptions.label}</p>
      </div>
    </div>
  );
}

export function PostGrowReflectionCandidatePasteValidator() {
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<PostGrowReflectionCandidatePasteResult>(() =>
    validatePostGrowReflectionCandidatePaste(),
  );
  const summary = buildPostGrowReflectionCandidateValidationSummary(result);
  const reviewPacket = buildPostGrowReflectionReviewPacket(result);

  function validateCandidate() {
    setResult(validatePostGrowReflectionCandidatePaste(rawText));
  }

  function clearCandidate() {
    setRawText("");
    setResult(validatePostGrowReflectionCandidatePaste());
  }

  function loadEnvelopeSample(id: "valid_envelope" | "contract_rejected_missing_candidate") {
    const sample = findPostGrowReflectionEnvelopeSample(id);
    setRawText(sample.jsonText);
    setResult(validatePostGrowReflectionCandidatePaste());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Candidate Paste Validator</CardTitle>
          <Badge variant="outline">Operator-only</Badge>
          <Badge variant="outline">Manual paste</Badge>
          <Badge variant="outline">Envelope supported</Badge>
          <Badge variant="outline">Local samples</Badge>
          <Badge variant="outline">Sanitized summary</Badge>
          <Badge variant="outline">Not saved</Badge>
          <Badge variant="outline">No live AI call</Badge>
        </div>
        <CardDescription>
          Operator-only local validator — runs the same envelope and reflection contract checks
          used by the dry-run adapter boundary. Nothing is saved or sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => loadEnvelopeSample("valid_envelope")}
          >
            Load valid envelope sample
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadEnvelopeSample("contract_rejected_missing_candidate")}
          >
            Load rejected envelope sample
          </Button>
        </div>
        <Textarea
          aria-label="Candidate JSON"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="Paste ReflectionOutput JSON or candidate envelope here"
          rows={8}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={validateCandidate}>
            Validate pasted candidate
          </Button>
          <Button type="button" variant="outline" onClick={clearCandidate}>
            Clear
          </Button>
        </div>
        <ResultPanel result={result} />
        {result.status === "validated" && <ValidationSummaryPanel summary={summary} />}
        {result.status === "validated" && (
          <PostGrowReflectionReviewPacketCard packet={reviewPacket} />
        )}
      </CardContent>
    </Card>
  );
}

export default PostGrowReflectionCandidatePasteValidator;
