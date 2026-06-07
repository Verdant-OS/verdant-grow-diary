import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildDevOpsBackupEncryptionViewModel,
  type DevOpsBackupEncryptionViewModel,
} from "@/lib/devOpsBackupEncryptionViewModel";
import type { BackupEncryptionStatusInput } from "@/lib/backupEncryptionStatusRules";

interface Props {
  input: BackupEncryptionStatusInput;
}

function riskVariant(
  tone: DevOpsBackupEncryptionViewModel["riskBadge"]["tone"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (tone) {
    case "healthy":
      return "default";
    case "warning":
      return "secondary";
    case "critical":
      return "destructive";
    case "unknown":
    default:
      return "outline";
  }
}

export function DevOpsBackupEncryptionCard({ input }: Props) {
  const vm = buildDevOpsBackupEncryptionViewModel(input);
  return (
    <Card data-testid="devops-backup-encryption-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{vm.title}</CardTitle>
        <div className="flex items-center gap-2">
          {vm.demoBadge && (
            <Badge variant="outline" data-testid="demo-badge">
              {vm.demoBadge.label}
            </Badge>
          )}
          {vm.staleBadge && (
            <Badge variant="outline" data-testid="stale-badge">
              {vm.staleBadge.label}
            </Badge>
          )}
          <Badge variant="outline" data-testid="state-badge">
            {vm.stateBadge.label}
          </Badge>
          <Badge
            variant={riskVariant(vm.riskBadge.tone)}
            data-testid="risk-badge"
          >
            {vm.riskBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <p data-testid="status-message">{vm.status.message}</p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {vm.lines.map((line) => (
            <div key={line.label} className="contents">
              <dt className="font-medium">{line.label}</dt>
              <dd className="break-words">{line.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default DevOpsBackupEncryptionCard;
