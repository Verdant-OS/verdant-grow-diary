/**
 * Shared, in-memory PHENOHUNT tester-feedback store.
 *
 * Scoped to the PhenoHunt workspace via a React provider. No persistence,
 * no AI, no Action Queue, no automation, no device control, no sensor
 * ingest, no schema changes. Downstream tools (report, summary table,
 * comparison, history) read submissions from this context.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface PhenoSamplingSubmission {
  readonly id: string;
  readonly submittedAt: string; // ISO timestamp
  readonly testerCode: string;
  readonly candidateId: string;
  readonly sampleFormat: string;
  readonly dryHit: string;
  readonly flavor: string;
  readonly burnQuality: string;
  readonly ashColor: string;
  readonly oilRing: string;
  readonly effect: string;
  readonly overall: number | null;
  readonly notes: string;
}

export type PhenoSamplingInput = Omit<
  PhenoSamplingSubmission,
  "id" | "submittedAt"
> & {
  readonly submittedAt?: string;
};

interface PhenoSamplingContextValue {
  readonly submissions: readonly PhenoSamplingSubmission[];
  readonly recordSubmission: (input: PhenoSamplingInput) => PhenoSamplingSubmission;
}

const PhenoSamplingContext = createContext<PhenoSamplingContextValue | null>(null);

let __nextId = 1;
function makeId(): string {
  __nextId += 1;
  return `sub-${Date.now().toString(36)}-${__nextId}`;
}

export function PhenoSamplingProvider({ children }: { children: React.ReactNode }) {
  const [submissions, setSubmissions] = useState<PhenoSamplingSubmission[]>([]);
  const recordSubmission = useCallback((input: PhenoSamplingInput) => {
    const submission: PhenoSamplingSubmission = {
      id: makeId(),
      submittedAt: input.submittedAt ?? new Date().toISOString(),
      testerCode: input.testerCode,
      candidateId: input.candidateId,
      sampleFormat: input.sampleFormat,
      dryHit: input.dryHit,
      flavor: input.flavor,
      burnQuality: input.burnQuality,
      ashColor: input.ashColor,
      oilRing: input.oilRing,
      effect: input.effect,
      overall: input.overall,
      notes: input.notes,
    };
    setSubmissions((prev) => [...prev, submission]);
    return submission;
  }, []);

  const value = useMemo<PhenoSamplingContextValue>(
    () => ({ submissions, recordSubmission }),
    [submissions, recordSubmission],
  );

  return (
    <PhenoSamplingContext.Provider value={value}>
      {children}
    </PhenoSamplingContext.Provider>
  );
}

/** Returns null when no provider is present (existing standalone usage). */
export function usePhenoSamplingOptional(): PhenoSamplingContextValue | null {
  return useContext(PhenoSamplingContext);
}

export function usePhenoSampling(): PhenoSamplingContextValue {
  const ctx = useContext(PhenoSamplingContext);
  if (!ctx) throw new Error("PhenoSamplingProvider missing");
  return ctx;
}
