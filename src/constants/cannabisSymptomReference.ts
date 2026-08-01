import { CANNABIS_SYMPTOM_DEFINITIONS, type CannabisSymptomId } from "./cannabisSymptomTypes";

export interface SymptomReferenceRow {
  readonly symptomId: CannabisSymptomId;
  readonly visibleSign: string;
  readonly compareFirst: string;
  readonly doNotAssume: string;
}

export interface SymptomReferenceTableData {
  readonly caption: string;
  readonly rows: ReadonlyArray<SymptomReferenceRow>;
}

const ROWS: ReadonlyArray<SymptomReferenceRow> = CANNABIS_SYMPTOM_DEFINITIONS.map((item) => ({
  symptomId: item.id,
  visibleSign: item.label,
  compareFirst: item.verificationTopics.join(", "),
  doNotAssume: item.whatNotToAssume,
}));

export const CANNABIS_SYMPTOM_REFERENCE_TABLE: SymptomReferenceTableData = Object.freeze({
  caption: "Visible signs and the evidence to compare before drawing a conclusion",
  rows: ROWS,
});

export function symptomReferenceTableFor(symptomId: CannabisSymptomId): SymptomReferenceTableData {
  return {
    ...CANNABIS_SYMPTOM_REFERENCE_TABLE,
    rows: ROWS.filter((row) => row.symptomId === symptomId),
  };
}

export const SYMPTOM_NO_STACK_RULE =
  "Change one variable at a time when the plant is stable enough to observe. Record the change, keep the rest steady, and compare new growth before stacking another correction.";
