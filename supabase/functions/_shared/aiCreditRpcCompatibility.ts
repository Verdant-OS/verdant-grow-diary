// Narrow edge-first rollout compatibility for the AI-credit RPC overloads.
// Fallback is allowed only when PostgREST/Postgres specifically says that the
// new overload does not exist. Permission, timeout, validation, and database
// errors must fail closed and must never fall back to a browser-callable RPC.

function asErrorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === "object" && !Array.isArray(error)
    ? (error as Record<string, unknown>)
    : null;
}

export function isMissingAiCreditRpcOverload(
  error: unknown,
  functionName: "ai_credit_spend" | "ai_credit_refund",
  distinguishingParameter: "p_user_id" | "p_expected_user_id",
): boolean {
  const record = asErrorRecord(error);
  if (!record) return false;
  const code = typeof record.code === "string" ? record.code : "";
  if (code !== "PGRST202" && code !== "42883") return false;

  const messageParts = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    messageParts.includes(functionName.toLowerCase()) &&
    messageParts.includes(distinguishingParameter.toLowerCase())
  );
}
