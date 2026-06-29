/**
 * OperatorModeCallout — dashboard CTA visible only to operator-role users.
 *
 * Renders nothing for non-operators or while role status is still resolving,
 * so the operator preview path never leaks to non-operators.
 *
 * Safety:
 *  - server-backed role check via useHasRole("operator").
 *  - no writes; navigation only.
 *  - no IDs, role rows, RPC names, or tokens rendered.
 */
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasRole } from "@/hooks/useHasRole";
import { OPERATOR_MODE_PATH } from "@/components/OperatorModeLink";

export default function OperatorModeCallout() {
  const role = useHasRole("operator");
  if (role.status !== "granted") return null;

  return (
    <Card data-testid="operator-mode-callout">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Operator Mode
        </CardTitle>
        <CardDescription>
          Open the protected demo preview and operator diagnostics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild data-testid="operator-mode-callout-cta">
          <Link to={OPERATOR_MODE_PATH}>Open operator preview</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
