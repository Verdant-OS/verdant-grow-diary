import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";
import {
  CHECKOUT_LIVE_FAQ_ID,
  sandboxCheckoutTestModeNote,
} from "@/lib/sandboxCheckoutTestModeNoteRules";

export function SandboxCheckoutTestModeNote({
  environment,
}: {
  environment: PaddleCheckoutEnvironment | null | undefined;
}) {
  const note = sandboxCheckoutTestModeNote(environment);
  if (!note) return null;
  return (
    <p
      data-testid="sandbox-checkout-test-mode-note"
      className="mb-3 text-sm leading-relaxed text-muted-foreground"
    >
      {note}{" "}
      <a href={`#${CHECKOUT_LIVE_FAQ_ID}`} className="underline underline-offset-2">
        Is checkout live?
      </a>
    </p>
  );
}
