import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseFeature } from "@/lib/featureEntitlements";

/**
 * PhenoTrackerPreviewCard — presenter-only marketing card that shows what
 * Pheno Tracker unlocks. Renders on the Upgrade page and is safe to drop
 * into a dashboard slot in the future.
 *
 * SAFETY: presentation only. Does not fetch, does not write, does not read
 * pheno data. Server-side entitlement enforcement lives in RLS +
 * `assertPhenoTrackerEntitlement`.
 */
export interface PhenoTrackerPreviewCardProps {
  /** Test id override. */
  "data-testid"?: string;
  className?: string;
}

const HIGHLIGHTS: ReadonlyArray<string> = [
  "Pheno hunts",
  "Candidate evidence",
  "Evidence Packet Map",
  "Keeper decisions",
  "Replication readiness",
  "Post-harvest / post-cure labels",
  "Export your pheno report",
];

export default function PhenoTrackerPreviewCard({
  className,
  ...rest
}: PhenoTrackerPreviewCardProps) {
  const testId = rest["data-testid"] ?? "pheno-tracker-preview-card";
  const { entitlement, loading, lookupFailed, refetch } = useMyEntitlements();
  const entitled =
    !loading && !lookupFailed && canUseFeature(entitlement, "pheno_tracker");

  return (
    <Card
      data-testid={testId}
      data-entitled={entitled ? "true" : "false"}
      className={className}
    >
      <CardHeader>
        <p className="text-xs uppercase tracking-widest text-primary font-medium">
          Pro feature
        </p>
        <CardTitle className="mt-1 flex items-center gap-2 font-display text-xl">
          <Sprout className="h-5 w-5 text-primary" aria-hidden="true" />
          Pheno Tracker
        </CardTitle>
        <CardDescription>
          Track candidate evidence, compare phenos, preserve keeper decisions,
          and document post-cure results.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {HIGHLIGHTS.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-primary"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        {loading ? (
          <span className="text-sm text-muted-foreground">Checking access…</span>
        ) : lookupFailed ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid={`${testId}-retry`}
              onClick={() => void refetch()}
            >
              Retry plan check
            </Button>
            <Link
              to="/pheno-comparison"
              data-testid={`${testId}-demo-link`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              View Demo
            </Link>
          </>
        ) : entitled ? (
          <Link to="/pheno-hunts/new" data-testid={`${testId}-start-link`}>
            <Button size="sm">Start Pheno Hunt</Button>
          </Link>
        ) : (
          <>
            <Link to="/pricing" data-testid={`${testId}-upgrade-link`}>
              <Button size="sm">Upgrade to Pro</Button>
            </Link>
            <Link
              to="/pheno-comparison"
              data-testid={`${testId}-demo-link`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              View Demo
            </Link>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
