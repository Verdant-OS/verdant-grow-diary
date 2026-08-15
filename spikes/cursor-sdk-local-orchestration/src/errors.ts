export type OrchestrationErrorCode =
  | "POLICY_REJECTED"
  | "TIMEOUT"
  | "CONCURRENT_SEND"
  | "NON_RETRYABLE"
  | "RETRY_EXHAUSTED"
  | "BUDGET_EXCEEDED"
  | "SCHEMA_INVALID"
  | "FIXTURE_MUTATED"
  | "MISSING_API_KEY"
  | "MISSING_MODEL"
  | "LIVE_PROOF_UNAUTHORIZED"
  | "NODE_VERSION"
  | "CLEANUP_FAILED";

export class OrchestrationError extends Error {
  readonly code: OrchestrationErrorCode;
  readonly retryable: boolean;

  constructor(message: string, options: { code: OrchestrationErrorCode; retryable: boolean }) {
    super(message);
    this.name = "OrchestrationError";
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof OrchestrationError) {
    return error.retryable;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error ? String(error.name) : "";
  if (
    name === "ConfigurationError" ||
    name === "AuthenticationError" ||
    name === "AgentBusyError"
  ) {
    return false;
  }
  const retryableFlag = "isRetryable" in error ? Boolean(error.isRetryable) : false;
  return retryableFlag && (name === "NetworkError" || name === "RateLimitError");
}
