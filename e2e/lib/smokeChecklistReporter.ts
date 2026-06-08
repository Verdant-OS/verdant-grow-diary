/**
 * Pure step-by-step pass/fail reporter for Quick Log smoke checklist.
 *
 * Deterministic. No I/O side effects beyond returning a printable report.
 * Does NOT write to Supabase. Does NOT carry credentials.
 */
export type SmokeStepStatus = "pass" | "fail" | "skipped";

export interface SmokeStep {
  step: number;
  label: string;
  status: SmokeStepStatus;
  evidence: string;
}

export class SmokeChecklistReporter {
  private readonly steps: SmokeStep[] = [];

  record(step: number, label: string, status: SmokeStepStatus, evidence = "") {
    this.steps.push({ step, label, status, evidence });
  }

  async run(
    step: number,
    label: string,
    fn: () => Promise<string | void>,
  ): Promise<void> {
    try {
      const result = await fn();
      const evidence = typeof result === "string" && result.length > 0 ? result : "ok";
      this.record(step, label, "pass", evidence);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.record(step, label, "fail", msg);
      throw new Error(`Smoke step ${step} failed: ${label}\n${msg}`);
    }
  }

  skip(step: number, label: string, reason: string) {
    this.record(step, label, "skipped", reason);
  }

  getSteps(): readonly SmokeStep[] {
    return this.steps;
  }

  firstFailure(): SmokeStep | undefined {
    return this.steps.find((s) => s.status === "fail");
  }

  toJSON() {
    return {
      total: this.steps.length,
      passed: this.steps.filter((s) => s.status === "pass").length,
      failed: this.steps.filter((s) => s.status === "fail").length,
      skipped: this.steps.filter((s) => s.status === "skipped").length,
      steps: this.steps,
    };
  }

  toText(): string {
    const lines: string[] = [];
    lines.push("Quick Log Smoke Checklist");
    lines.push("=========================");
    for (const s of this.steps) {
      const marker =
        s.status === "pass" ? "✓" : s.status === "fail" ? "✗" : "·";
      lines.push(`${marker} [${s.step}] ${s.label} — ${s.evidence}`);
    }
    const j = this.toJSON();
    lines.push("");
    lines.push(
      `Totals: ${j.passed} pass / ${j.failed} fail / ${j.skipped} skipped (of ${j.total})`,
    );
    return lines.join("\n");
  }
}
