import type { PaddleCheckoutEnvironment } from "@/lib/paddleEnvironment";
import { sandboxCheckoutTestModeNote } from "@/lib/sandboxCheckoutTestModeNoteRules";

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
      {note}
    </p>
  );
}
