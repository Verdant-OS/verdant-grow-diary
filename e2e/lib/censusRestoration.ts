import type { ElementHandle, Locator } from "@playwright/test";

export type CensusFieldTarget = Locator | ElementHandle<SVGElement | HTMLElement>;
export type RestorationPhase = "fill" | "match" | "settle";
export type RestorationError = { name: string; message: string };
export type FieldState = {
  connected: boolean;
  value: string | null;
  tag: string;
  type: string | null;
  id: string | null;
  name: string | null;
  focused: boolean;
  selectionStart: number | null;
  selectionEnd: number | null;
  documentReadyState: string;
};
export type RestorationFailure = {
  phase: RestorationPhase;
  target: "pinned" | "replacement";
  expected: string;
  observed: FieldState | null;
  error?: RestorationError;
  observationError?: RestorationError;
};
export type OriginalValueRead =
  { known: true; value: string } | { known: false; error: RestorationError };

export function restorationError(error: unknown): RestorationError {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "NonError", message: String(error) };
}

/** One observation, never an action, retry, or assertion. DOM readiness is not hydration. */
export async function observeCensusField(target: CensusFieldTarget): Promise<FieldState> {
  const observe = (element: SVGElement | HTMLElement): FieldState => {
    const field = element as HTMLInputElement | HTMLTextAreaElement;
    return {
      connected: element.isConnected,
      value: typeof field.value === "string" ? field.value : null,
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute("type"),
      id: element.getAttribute("id"),
      name: element.getAttribute("name"),
      focused: element.ownerDocument.activeElement === element,
      selectionStart: typeof field.selectionStart === "number" ? field.selectionStart : null,
      selectionEnd: typeof field.selectionEnd === "number" ? field.selectionEnd : null,
      documentReadyState: element.ownerDocument.readyState,
    };
  };
  return "elementHandle" in target
    ? target.evaluate(observe, undefined, { timeout: 1_000 })
    : target.evaluate(observe);
}

/** The existing fill / bounded poll / 250ms persistence check, with failure-only evidence. */
export async function restoreCensusField(
  target: CensusFieldTarget,
  value: string,
  pollMatches: () => Promise<unknown>,
  failures: RestorationFailure[],
  targetKind: RestorationFailure["target"],
): Promise<boolean> {
  const fail = (phase: RestorationPhase, error?: unknown) => {
    const failure: RestorationFailure = {
      phase,
      target: targetKind,
      expected: value,
      observed: null,
    };
    if (error !== undefined) failure.error = restorationError(error);
    failures.push(failure);
    return false;
  };

  try {
    await target.fill(value, { timeout: 5_000 });
  } catch (error) {
    return fail("fill", error);
  }
  try {
    await pollMatches();
  } catch (error) {
    return fail("match", error);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    const hasPersisted = (element: SVGElement | HTMLElement, expected: string) =>
      element.isConnected && ((element as HTMLInputElement).value ?? null) === expected;
    const persisted =
      "elementHandle" in target
        ? await target.evaluate(hasPersisted, value)
        : await target.evaluate(hasPersisted, value);
    return persisted ? true : fail("settle");
  } catch (error) {
    return fail("settle", error);
  }
}

/** Observe only after the caller's existing restoration/fallback decision is fixed as failure. */
export async function observeRestorationFailures(
  failures: RestorationFailure[],
  targets: Record<RestorationFailure["target"], CensusFieldTarget>,
): Promise<void> {
  for (const failure of failures) {
    try {
      failure.observed = await observeCensusField(targets[failure.target]);
    } catch (error) {
      failure.observationError = restorationError(error);
    }
  }
}

export type RestorationContext = {
  route: string;
  field: string;
  type: string;
  original: OriginalValueRead;
  live: FieldState | null;
  liveMatchesPinned: boolean;
  liveHoldsPlaceholder: boolean;
};

/** Bounded JSON keeps newlines/quotes unambiguous; sensitive fields never print values/errors. */
export function formatRestorationDiagnostics(
  context: RestorationContext,
  failures: readonly RestorationFailure[],
): string {
  const sensitive = /password|secret|token/i.test(context.type + " " + context.field);
  return JSON.stringify(
    { observedAt: "after-restoration-decision", context, attempts: failures },
    (key, value: unknown) => {
      if (sensitive && ["value", "expected", "message"].includes(key)) return "[redacted]";
      return typeof value === "string" && value.length > 512 ? value.slice(0, 512) + "…" : value;
    },
  );
}
