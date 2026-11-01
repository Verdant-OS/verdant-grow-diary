/**
 * guideAnswerFirstLayoutRules — pure selection for the shared guide layout.
 *
 * Chooses the question, a one-to-two sentence answer, one source link, and
 * the closing FAQ from fields the guide already has. Missing or blank fields
 * become null or an empty list. This module does not invent copy.
 */

export interface GuideAnswerFirstSourceLink {
  readonly label: string;
  readonly href: string;
}

export interface GuideAnswerFirstFaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface GuideAnswerFirstLayout {
  readonly question: string | null;
  /** First one or two sentences of the guide's existing answer field. */
  readonly answer: string | null;
  /** Sentences after the lead answer, still from the same answer field. */
  readonly answerRemainder: string | null;
  readonly source: GuideAnswerFirstSourceLink | null;
  readonly faq: ReadonlyArray<GuideAnswerFirstFaqItem>;
}

export interface GuideAnswerFirstSourceInput {
  readonly label?: string | null;
  readonly href?: string | null;
}

export interface GuideAnswerFirstFaqInput {
  readonly question?: string | null;
  readonly answer?: string | null;
}

export interface GuideAnswerFirstInput {
  readonly question?: string | null;
  readonly answer?: string | null;
  readonly sources?: ReadonlyArray<GuideAnswerFirstSourceInput | null> | null;
  readonly faq?: ReadonlyArray<GuideAnswerFirstFaqInput | null> | null;
}

const LEAD_SENTENCE_LIMIT = 2;

const ABBREVIATION_BEFORE_PERIOD = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St|U\.S|U\.K)$/i;

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSentenceBoundary(text: string, periodIndex: number): boolean {
  const mark = text[periodIndex];
  if (mark !== "." && mark !== "!" && mark !== "?") return false;
  if (
    mark === "." &&
    periodIndex > 0 &&
    periodIndex + 1 < text.length &&
    /\d/.test(text[periodIndex - 1] ?? "") &&
    /\d/.test(text[periodIndex + 1] ?? "")
  ) {
    return false;
  }
  if (mark === "." && ABBREVIATION_BEFORE_PERIOD.test(text.slice(0, periodIndex))) {
    return false;
  }

  let cursor = periodIndex + 1;
  if (cursor >= text.length) return true;
  if (!/\s/.test(text[cursor] ?? "")) return false;
  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) cursor += 1;
  if (cursor >= text.length) return true;
  const next = text[cursor] ?? "";
  return next === '"' || next === "“" || next === "'" || /[A-Z]/.test(next);
}

function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (!isSentenceBoundary(trimmed, index)) continue;
    const sentence = trimmed.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    let next = index + 1;
    while (next < trimmed.length && /\s/.test(trimmed[next] ?? "")) next += 1;
    start = next;
    index = next - 1;
  }
  if (start < trimmed.length) {
    const tail = trimmed.slice(start).trim();
    if (tail) sentences.push(tail);
  }
  return sentences;
}

function selectLeadAnswer(answer: string | null): {
  readonly answer: string | null;
  readonly answerRemainder: string | null;
} {
  if (!answer) return { answer: null, answerRemainder: null };
  const sentences = splitSentences(answer);
  if (sentences.length === 0) return { answer: null, answerRemainder: null };
  const lead = sentences.slice(0, LEAD_SENTENCE_LIMIT).join(" ");
  const remainder = sentences.slice(LEAD_SENTENCE_LIMIT);
  return {
    answer: lead.length > 0 ? lead : null,
    answerRemainder: remainder.length > 0 ? remainder.join(" ") : null,
  };
}

function selectSource(
  sources: ReadonlyArray<GuideAnswerFirstSourceInput | null> | null | undefined,
): GuideAnswerFirstSourceLink | null {
  for (const source of sources ?? []) {
    if (!source) continue;
    const label = nonEmpty(source.label);
    const href = nonEmpty(source.href);
    if (!label || !href) continue;
    return { label, href };
  }
  return null;
}

export function visibleGuideAnswerFirstFaqItem(
  entry: GuideAnswerFirstFaqInput | null | undefined,
): GuideAnswerFirstFaqItem | null {
  if (!entry) return null;
  const question = nonEmpty(entry.question);
  const answer = nonEmpty(entry.answer);
  if (!question || !answer) return null;
  return { question, answer };
}

function selectFaq(
  faq: ReadonlyArray<GuideAnswerFirstFaqInput | null> | null | undefined,
): ReadonlyArray<GuideAnswerFirstFaqItem> {
  const items: GuideAnswerFirstFaqItem[] = [];
  for (const entry of faq ?? []) {
    const item = visibleGuideAnswerFirstFaqItem(entry);
    if (item) items.push(item);
  }
  return items;
}

export function selectGuideAnswerFirstLayout(
  input: GuideAnswerFirstInput | null | undefined,
): GuideAnswerFirstLayout {
  if (!input) {
    return {
      question: null,
      answer: null,
      answerRemainder: null,
      source: null,
      faq: [],
    };
  }
  const lead = selectLeadAnswer(nonEmpty(input.answer));
  return {
    question: nonEmpty(input.question),
    answer: lead.answer,
    answerRemainder: lead.answerRemainder,
    source: selectSource(input.sources),
    faq: selectFaq(input.faq),
  };
}
