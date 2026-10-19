/**
 * Compatibility re-export. The verifier moved to
 * ../_shared/verifyPaddleSignature.ts so functions that import it through
 * _shared/paddle.ts can be bundled. Keep this path for existing imports.
 */
export * from "../_shared/verifyPaddleSignature.ts";
