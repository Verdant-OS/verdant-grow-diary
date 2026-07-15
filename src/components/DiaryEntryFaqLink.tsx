/**
 * DiaryEntryFaqLink — small presenter that surfaces a "Related FAQ"
 * link on a diary timeline row when the entry's text, tags, or event
 * type matches a common cannabis plant care topic.
 *
 * Presenter only. All matching logic lives in
 * src/lib/diaryFaqLinkRules.ts. This component never queries, writes,
 * calls AI, or touches device control.
 */
import { HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  buildDiaryFaqLink,
  type DiaryFaqLinkInput,
} from "@/lib/diaryFaqLinkRules";
import { recordDiaryFaqLinkClick } from "@/lib/diaryFaqLinkClickTracker";
import { cn } from "@/lib/utils";

export interface DiaryEntryFaqLinkProps {
  item: DiaryFaqLinkInput;
  className?: string;
}

export default function DiaryEntryFaqLink({
  item,
  className,
}: DiaryEntryFaqLinkProps) {
  const link = buildDiaryFaqLink(item);
  if (!link) return null;
  return (
    <Link
      to={link.href}
      data-testid="diary-entry-faq-link"
      data-faq-topic={link.matchedTopic}
      data-faq-index={String(link.faqIndex)}
      className={cn(
        "mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2",
        className,
      )}
    >
      <HelpCircle className="h-3 w-3" aria-hidden="true" />
      <span>Related FAQ: {link.question}</span>
    </Link>
  );
}
