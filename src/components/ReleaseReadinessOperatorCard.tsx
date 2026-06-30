/**
 * ReleaseReadinessOperatorCard — operator-only Dashboard CTA.
 *
 * Links to the read-only /operator/release-readiness status page. Renders
 * nothing for non-operators or while role status is still resolving, so the
 * operator path never leaks into the DOM for unauthorized viewers.
 *
 * Safety:
 *  - server-backed role check via useHasRole("operator").
 *  - navigation only; no writes, no fetches, no live data.
 *  - no IDs, role rows, RPC names, or tokens rendered.
 *  - explicitly labels the destination as static / manual (not a live CI feed).
 */
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHasRole } from "@/hooks/useHasRole";

export const RELEASE_READINESS_PATH = "/operator/release-readiness";

export default function ReleaseReadinessOperatorCard() {
  const role = useHasRole("operator");
  if (role.status !== "granted") return null;

  return (
    <Card data-testid="release-readiness-operator-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" /> Release Readiness
        </CardTitle>
        <CardDescription>
          Review current validation status, blockers, and manual proof
          commands. Static / manual snapshot — updated by hand from documented
          receipts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild data-testid="release-readiness-operator-card-cta">
          <Link to={RELEASE_READINESS_PATH}>Open Release Readiness</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
