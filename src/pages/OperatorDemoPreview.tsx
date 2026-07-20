/**
 * OperatorDemoPreview — protected operator-only page that renders the
 * One-Tent Evidence Chain demo fixture as a read-only walkthrough.
 *
 * Auth: mounted under <RequireOperatorRole /> in src/App.tsx.
 * No DB writes. No mutation controls. No automation. No device control.
 */
import { useState } from "react";
import { buildOperatorDemoPreviewViewModel } from "@/lib/operatorDemoPreviewViewModel";
import OperatorDemoEvidenceChainPreview from "@/components/OperatorDemoEvidenceChainPreview";
import OperatorAccountReadModelsPanel from "@/components/OperatorAccountReadModelsPanel";
import { useOperatorAccountReadModels } from "@/hooks/useOperatorAccountReadModels";

export default function OperatorDemoPreview() {
  const vm = buildOperatorDemoPreviewViewModel();
  const [selectedTentId, setSelectedTentId] = useState<string | null>(null);
  const accountModel = useOperatorAccountReadModels({ selectedTentId });
  return (
    <>
      <OperatorAccountReadModelsPanel
        model={accountModel}
        onTentSelectionChange={setSelectedTentId}
      />
      <OperatorDemoEvidenceChainPreview vm={vm} />
    </>
  );
}
