/**
 * OperatorDemoPreview — protected operator-only page that renders the
 * One-Tent Evidence Chain demo fixture as a read-only walkthrough.
 *
 * Auth: mounted under <RequireOperatorRole /> in src/App.tsx.
 * No DB writes. No mutation controls. No automation. No device control.
 */
import { buildOperatorDemoPreviewViewModel } from "@/lib/operatorDemoPreviewViewModel";
import OperatorDemoEvidenceChainPreview from "@/components/OperatorDemoEvidenceChainPreview";
import OperatorAccountReadModelsPanel from "@/components/OperatorAccountReadModelsPanel";
import { useOperatorAccountReadModels } from "@/hooks/useOperatorAccountReadModels";

export default function OperatorDemoPreview() {
  const vm = buildOperatorDemoPreviewViewModel();
  const accountModel = useOperatorAccountReadModels();
  return (
    <>
      <OperatorAccountReadModelsPanel model={accountModel} />
      <OperatorDemoEvidenceChainPreview vm={vm} />
    </>
  );
}
