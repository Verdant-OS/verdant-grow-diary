/**
 * verdantSkillEvaluationDigest — the Node-only cryptographic adapter for the
 * Build 7 evaluation harness.
 *
 * WHY THIS LIVES IN `scripts/` AND NOT `src/lib/`.
 * Binding integrity needs a cryptographic digest, and the only one available
 * synchronously is `node:crypto`. Everything under `src/lib` is reachable by
 * the Vite client bundle, and this repository imports `node:crypto` nowhere in
 * `src/` — introducing it there would be the first browser-bundle hazard of
 * its kind, and a conditional runtime import would hide that hazard rather
 * than remove it.
 *
 * So the boundary is physical, not conditional. `verdantSkillEvaluationBindings`
 * owns the types, the canonical envelope, the required-binding policy and the
 * fail-closed verifier, and is safe anywhere. This module owns the hash and is
 * importable only by the harness, its CLI, and tests. A caller without a
 * `DigestFn` cannot construct a binding at all, which is the correct failure:
 * unbound evaluation should be impossible, not merely discouraged.
 *
 * A source-scan test asserts `src/` never imports `node:crypto`, so this
 * separation cannot erode quietly.
 */

import { createHash } from "node:crypto";
import type { DigestAlgorithm, DigestFn } from "@/lib/verdantSkillEvaluationBindings";

/**
 * SHA-256 over the UTF-8 bytes of the canonical envelope string.
 *
 * The encoding is stated explicitly because a digest is only reproducible if
 * both sides agree on how text becomes bytes — the same characters under a
 * different encoding are a different input and a different hash.
 */
export const sha256Digest: DigestFn = (canonicalEnvelopeBytes: string): string =>
  createHash("sha256").update(canonicalEnvelopeBytes, "utf8").digest("hex");

/**
 * Resolve a digest function by algorithm label.
 *
 * Throws on anything unrecognized rather than falling back. A relabelled
 * digest must never be silently reinterpreted under a different algorithm —
 * that would let an attacker or an accident downgrade the boundary by editing
 * one string.
 */
export function digestFnFor(algorithm: DigestAlgorithm): DigestFn {
  if (algorithm === "sha256") return sha256Digest;
  throw new Error(
    `[verdantSkillEvaluationDigest] unsupported digest algorithm: ${String(algorithm)}`,
  );
}
