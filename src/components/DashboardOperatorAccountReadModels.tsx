/**
 * DashboardOperatorAccountReadModels — operator-only Dashboard bridge for the
 * signed-in grower's owner-scoped diary, sensor, and watering read models.
 *
 * The outer component performs the server-backed role check before mounting
 * the data hook. Denied, unresolved, unauthenticated, and error states render
 * nothing and execute no account read-model queries.
 */
import { useState } from "react";
import OperatorAccountReadModelsPanel from "@/components/OperatorAccountReadModelsPanel";
import { useHasRole } from "@/hooks/useHasRole";
import { useOperatorAccountReadModels } from "@/hooks/useOperatorAccountReadModels";

export interface DashboardOperatorAccountReadModelsProps {
  /** Optional Dashboard grow scope. Omit to use the account's active grow. */
  growId?: string | null;
}

function DashboardOperatorAccountReadModelsContent({
  growId,
}: DashboardOperatorAccountReadModelsProps) {
  const [selectedTentId, setSelectedTentId] = useState<string | null>(null);
  const model = useOperatorAccountReadModels({
    growId,
    selectedTentId,
  });

  return <OperatorAccountReadModelsPanel model={model} onTentSelectionChange={setSelectedTentId} />;
}

export default function DashboardOperatorAccountReadModels(
  props: DashboardOperatorAccountReadModelsProps,
) {
  const role = useHasRole("operator");
  if (role.status !== "granted") return null;

  return <DashboardOperatorAccountReadModelsContent {...props} />;
}
