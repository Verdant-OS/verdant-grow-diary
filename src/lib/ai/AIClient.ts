/**
 * VERDANT-18: AIClient interface + MockAIClient + ProductionAIClient stub.
 *
 * Pure TS only. No network calls in this file. The MockAIClient is the
 * only client used in tests, and is fully deterministic.
 */
import type { DoctorAnalysis, DoctorContext } from "./types";
import { fixtureKeyFor } from "./fixtureKey";

export interface AIClient {
  /** Run the Doctor analysis for the given context. */
  analyze(context: DoctorContext): Promise<DoctorAnalysis>;
}

/**
 * Deterministic in-memory client. Looks up an exact fixture by
 * fixtureKeyFor(context) and returns a frozen copy. Missing keys throw
 * a clear, actionable error — never a silent default.
 */
export class MockAIClient implements AIClient {
  private readonly registry: ReadonlyMap<string, DoctorAnalysis>;

  constructor(registry: ReadonlyMap<string, DoctorAnalysis>) {
    this.registry = registry;
  }

  async analyze(context: DoctorContext): Promise<DoctorAnalysis> {
    const key = fixtureKeyFor(context);
    const hit = this.registry.get(key);
    if (!hit) {
      throw new Error(
        `MockAIClient: no fixture registered for key "${key}". ` +
          `Add a fixture in src/lib/ai/doctorFixtures.ts or adjust the context.`,
      );
    }
    // Deep clone to guarantee callers cannot mutate the shared fixture.
    return JSON.parse(JSON.stringify(hit)) as DoctorAnalysis;
  }
}

/**
 * Production placeholder. Intentionally throws until the real wiring
 * lands behind an Edge Function. Keeping this here makes the contract
 * obvious without smuggling in network code.
 */
export class ProductionAIClient implements AIClient {
  async analyze(_context: DoctorContext): Promise<DoctorAnalysis> {
    throw new Error(
      "ProductionAIClient.analyze: not implemented. Wire this through " +
        "the AI Doctor Edge Function before enabling in production.",
    );
  }
}
