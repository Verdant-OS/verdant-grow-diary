/**
 * DiaryEntryLightingHelp — presenter-only contextual guide link and optional
 * read-only stress comparison for a lighting-related diary row.
 */

import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import LightStressTroubleshooter from "@/components/LightStressTroubleshooter";
import {
  buildDiaryLightingGuideLink,
  type DiaryLightingGuideLinkInput,
} from "@/lib/diaryLightingGuideLinkRules";
import { cn } from "@/lib/utils";

export interface DiaryEntryLightingHelpProps {
  readonly item: DiaryLightingGuideLinkInput;
  readonly className?: string;
}

export default function DiaryEntryLightingHelp({ item, className }: DiaryEntryLightingHelpProps) {
  const link = buildDiaryLightingGuideLink(item);
  if (!link) return null;

  return (
    <div
      data-testid="diary-entry-lighting-help"
      data-lighting-topic={link.matchedTopic}
      className={cn("basis-full", className)}
    >
      <Link
        to={link.href}
        data-testid="diary-entry-lighting-guide-link"
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        <span>Grow-light guide: {link.question}</span>
      </Link>
      {link.offersTroubleshooter ? <LightStressTroubleshooter /> : null}
    </div>
  );
}
