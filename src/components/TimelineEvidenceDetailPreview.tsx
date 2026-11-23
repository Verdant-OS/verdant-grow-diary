import type { ReactNode } from "react";
import TimelineEvidenceDetailDrawer from "@/components/TimelineEvidenceDetailDrawer";
import { useNowTick } from "@/hooks/useNowTick";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";
import { useWaterVolumeEntryUnit } from "@/hooks/useWaterVolumeEntryUnit";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import { timelineEntryDetailPhotoSrc } from "@/lib/timelineEntryDetailPermalinkRules";
import {
  buildTimelineEvidenceDetailViewModel,
  type TimelineEvidenceDetailInput,
} from "@/lib/timelineEvidenceDetailViewModel";

interface Props {
  entry: TimelineEvidenceDetailInput | null;
  open: boolean;
  onClose: () => void;
  actions?: ReactNode;
}

export default function TimelineEvidenceDetailPreview({ entry, open, onClose, actions }: Props) {
  if (!open || !entry) return null;
  return <OpenEvidenceDetail entry={entry} onClose={onClose} actions={actions} />;
}

function OpenEvidenceDetail({
  entry,
  onClose,
  actions,
}: Pick<Props, "onClose" | "actions"> & { entry: TimelineEvidenceDetailInput }) {
  const nowMs = useNowTick();
  const temperatureUnit = useTemperatureUnitPreference();
  const waterUnit = useWaterVolumeEntryUnit();
  const readingLines = presentTimelineDiaryEntryDetails(entry.details, temperatureUnit, {
    waterUnit,
    entryType:
      typeof entry.details?.event_type === "string"
        ? entry.details.event_type
        : typeof entry.details?.entry_type === "string"
          ? entry.details.entry_type
          : null,
  }).detailLines;
  return (
    <TimelineEvidenceDetailDrawer
      open
      viewModel={buildTimelineEvidenceDetailViewModel(entry, { nowMs })}
      photoSrc={timelineEntryDetailPhotoSrc(entry.photo_url)}
      readingLines={readingLines}
      actions={actions}
      onClose={onClose}
    />
  );
}
