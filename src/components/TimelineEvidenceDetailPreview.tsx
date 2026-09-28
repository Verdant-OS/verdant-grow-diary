import TimelineEvidenceDetailDrawer from "@/components/TimelineEvidenceDetailDrawer";
import { useNowTick } from "@/hooks/useNowTick";
import {
  buildTimelineEvidenceDetailViewModel,
  type TimelineEvidenceDetailInput,
} from "@/lib/timelineEvidenceDetailViewModel";

interface Props {
  entry: TimelineEvidenceDetailInput | null;
  open: boolean;
  onClose: () => void;
}

export default function TimelineEvidenceDetailPreview({ entry, open, onClose }: Props) {
  if (!open || !entry) return null;
  return <OpenEvidenceDetail entry={entry} onClose={onClose} />;
}

function OpenEvidenceDetail({
  entry,
  onClose,
}: Pick<Props, "onClose"> & { entry: TimelineEvidenceDetailInput }) {
  const nowMs = useNowTick();
  return (
    <TimelineEvidenceDetailDrawer
      open
      viewModel={buildTimelineEvidenceDetailViewModel(entry, { nowMs })}
      onClose={onClose}
    />
  );
}
