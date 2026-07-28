export interface BreedingSubmissionIdentity {
  growId: string;
  plantId: string;
  eventType: string;
  tentId: string | null;
  method: string | null;
  intensity: string | null;
  details: Readonly<Record<string, string>>;
}

export interface BreedingSubmissionAttempt {
  fingerprint: string;
  idempotencyKey: string;
}

function sortedDetails(details: Readonly<Record<string, string>>): Array<[string, string]> {
  return Object.entries(details).sort(([left], [right]) => left.localeCompare(right));
}

export function buildBreedingSubmissionFingerprint(input: BreedingSubmissionIdentity): string {
  return JSON.stringify([
    input.growId,
    input.plantId,
    input.eventType,
    input.tentId,
    input.method,
    input.intensity,
    sortedDetails(input.details),
  ]);
}

export function resolveBreedingSubmissionAttempt(
  previous: BreedingSubmissionAttempt | null,
  input: BreedingSubmissionIdentity,
  randomUuid: () => string,
): BreedingSubmissionAttempt {
  const fingerprint = buildBreedingSubmissionFingerprint(input);
  if (previous?.fingerprint === fingerprint) return previous;

  return {
    fingerprint,
    idempotencyKey: `breeding-event-${randomUuid()}`,
  };
}
