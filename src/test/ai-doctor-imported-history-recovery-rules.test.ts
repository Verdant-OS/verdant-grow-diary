import { describe, expect, it } from "vitest";
import {
  resolveAiDoctorImportedHistoryRecovery,
  type AiDoctorImportedHistoryRecoveryDecision,
  type AiDoctorImportedHistoryRecoveryInput,
} from "@/lib/aiDoctorImportedHistoryRecoveryRules";

const CASES: Array<{
  name: string;
  input: AiDoctorImportedHistoryRecoveryInput | null | undefined;
  expected: AiDoctorImportedHistoryRecoveryDecision;
}> = [
  {
    name: "missing input",
    input: undefined,
    expected: { state: "ready", blocksReview: false, showsRecovery: false },
  },
  {
    name: "null input",
    input: null,
    expected: { state: "ready", blocksReview: false, showsRecovery: false },
  },
  {
    name: "disabled tent scope ignores stale query flags",
    input: { hasTentScope: false, isFetching: true, isError: true },
    expected: { state: "ready", blocksReview: false, showsRecovery: false },
  },
  {
    name: "initial read in flight",
    input: { hasTentScope: true, isFetching: true, isError: false },
    expected: { state: "loading", blocksReview: true, showsRecovery: false },
  },
  {
    name: "failed read needs a decision",
    input: { hasTentScope: true, isFetching: false, isError: true },
    expected: { state: "decision_required", blocksReview: true, showsRecovery: true },
  },
  {
    name: "acknowledged omission permits review",
    input: {
      hasTentScope: true,
      isFetching: false,
      isError: true,
      omissionAcknowledged: true,
    },
    expected: { state: "omitted_by_choice", blocksReview: false, showsRecovery: true },
  },
  {
    name: "refetch blocks even after omission was acknowledged",
    input: {
      hasTentScope: true,
      isFetching: true,
      isError: true,
      omissionAcknowledged: true,
    },
    expected: { state: "omitted_by_choice", blocksReview: true, showsRecovery: true },
  },
  {
    name: "successful read clears recovery regardless of stale acknowledgement",
    input: {
      hasTentScope: true,
      isFetching: false,
      isError: false,
      omissionAcknowledged: true,
    },
    expected: { state: "ready", blocksReview: false, showsRecovery: false },
  },
];

describe("resolveAiDoctorImportedHistoryRecovery", () => {
  it.each(CASES)("resolves $name", ({ input, expected }) => {
    expect(resolveAiDoctorImportedHistoryRecovery(input)).toEqual(expected);
    expect(resolveAiDoctorImportedHistoryRecovery(input)).toEqual(expected);
  });
});
