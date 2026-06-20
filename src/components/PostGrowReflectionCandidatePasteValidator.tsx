import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  validatePostGrowReflectionCandidatePaste,
  type PostGrowReflectionCandidatePasteResult,
} from "@/lib/ai/postGrowReflectionCandidatePasteValidator";
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
          {result.failureReason}
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
        <div className="text-xs font-medium uppercase text-muted-foreground">Validation options</div>
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

  function validateCandidate() {
    setResult(validatePostGrowReflectionCandidatePaste(rawText));
  }

  function clearCandidate() {
    setRawText("");
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
          <Badge variant="outline">Not saved</Badge>
          <Badge variant="outline">No live AI call</Badge>
        </div>
        <CardDescription>
          Paste a candidate ReflectionOutput JSON or candidate envelope and run the same local
          validator used by the dry-run adapter boundary.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
}

export default PostGrowReflectionCandidatePasteValidator;
