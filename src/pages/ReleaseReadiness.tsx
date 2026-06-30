/**
 * Release Readiness — read-only operator-facing status page.
 *
 * Renders a static / manual snapshot of Verdant's validation posture,
 * blockers, and safe demo status. Does NOT call CI, GitHub, Supabase,
 * or any model. Does NOT mutate state. Mounted under RequireOperatorRole.
 */
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RELEASE_READINESS_VIEW_MODEL,
  type ReadinessStatusLabel,
} from "@/lib/releaseReadinessViewModel";
import {
  RELEASE_READINESS_EVIDENCE_RECEIPTS,
  RELEASE_READINESS_EVIDENCE_BLOCKERS,
  deriveReleaseEvidencePosture,
  groupEvidenceReceipts,
  getCategoryLabel,
  getCategoryDisclaimer,
  RELEASE_GO_REQUIREMENT_COPY,
  type ReceiptCategory,
  type ReceiptStatus,
} from "@/lib/releaseReadinessEvidenceReceiptViewModel";

const RECEIPT_CATEGORY_ORDER: ReceiptCategory[] = [
  "ci_full_suite",
  "local_targeted",
  "manual_operator_note",
];

function receiptStatusVariant(
  status: ReceiptStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pass":
      return "default";
    case "fail":
    case "blocked":
      return "destructive";
    case "pending":
    case "unknown":
      return "secondary";
    default:
      return "outline";
  }
}

function statusVariant(
  status: ReadinessStatusLabel,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PASS":
    case "PRESERVED":
      return "default";
    case "HOLD":
    case "BLOCKED":
      return "destructive";
    case "PENDING":
      return "secondary";
    default:
      return "outline";
  }
}

export default function ReleaseReadiness() {
  const vm = RELEASE_READINESS_VIEW_MODEL;
  const evidencePosture = deriveReleaseEvidencePosture(
    RELEASE_READINESS_EVIDENCE_RECEIPTS,
    RELEASE_READINESS_EVIDENCE_BLOCKERS,
  );
  const grouped = groupEvidenceReceipts(RELEASE_READINESS_EVIDENCE_RECEIPTS);

  return (
    <div
      className="container mx-auto max-w-4xl p-6 space-y-6"
      data-testid="release-readiness-page"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Verdant Release Readiness</h1>
        <p
          className="text-sm text-muted-foreground"
          data-testid="release-readiness-source-label"
        >
          {vm.sourceLabel}
        </p>
      </header>

      <Card data-testid="release-readiness-executive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Executive status
            <Badge variant={statusVariant(vm.overall.status)}>
              {vm.overall.status}
            </Badge>
          </CardTitle>
          <CardDescription>{vm.overall.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Demo posture:</span>
            <Badge variant={statusVariant(vm.demo.status)}>
              {vm.demo.status}
            </Badge>
            <span className="text-muted-foreground">{vm.demo.summary}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Release posture:</span>
            <Badge variant={statusVariant(vm.release.status)}>
              {vm.release.status}
            </Badge>
            <span className="text-muted-foreground">{vm.release.summary}</span>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="release-readiness-checks">
        <CardHeader>
          <CardTitle>Validation checks</CardTitle>
          <CardDescription>
            Each row reflects a documented receipt or static invariant — not a
            live CI feed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {vm.checks.map((c) => (
              <li
                key={c.id}
                className="border-l-2 border-muted pl-3"
                data-testid={`release-readiness-check-${c.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {c.source}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-1">{c.note}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="release-readiness-blockers">
        <CardHeader>
          <CardTitle>Blockers</CardTitle>
          <CardDescription>
            Release remains HOLD until each blocker has a real receipt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {vm.blockers.map((b) => (
              <li
                key={b.id}
                className="border-l-2 border-destructive/60 pl-3"
                data-testid={`release-readiness-blocker-${b.id}`}
              >
                <div className="font-medium">{b.label}</div>
                <div className="text-muted-foreground mt-1">{b.detail}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="release-readiness-commands">
        <CardHeader>
          <CardTitle>Manual validation commands</CardTitle>
          <CardDescription>
            Copy-paste; results must be recorded manually until CI receipts
            return.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {vm.commands.map((c) => (
              <li
                key={c.id}
                data-testid={`release-readiness-command-${c.id}`}
              >
                <div className="font-medium">{c.label}</div>
                <pre className="mt-1 rounded bg-muted px-3 py-2 text-xs overflow-x-auto">
                  <code>{c.command}</code>
                </pre>
                {c.note ? (
                  <div className="text-muted-foreground text-xs mt-1">
                    {c.note}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="release-readiness-safety">
        <CardHeader>
          <CardTitle>Safety notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-1 text-sm">
            {vm.safetyNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
