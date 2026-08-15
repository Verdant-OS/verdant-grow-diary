import { describe, expect, it } from "vitest";

import {
  CLIENT_EXECUTE_ROLES,
  EXECUTE_ROLE_SERVICE,
  PGMQ_EMAIL_WRAPPER_FUNCTIONS,
  PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS,
  QUICKLOG_WRITER_FUNCTIONS,
  TRIGGER_DEFINER_FUNCTIONS,
  authenticatedAndServiceRoleExecute,
  authenticatedOnlyExecute,
  clientRoleMayExecutePgmqWrapper,
  executeMatricesMatch,
  expectedExecuteForHardenableDefiner,
  noClientExecute,
  publicSchemaFunctionName,
  serviceRoleOnlyExecute,
  type HardenableDefinerFunction,
} from "./pgmqEmailWrapperGrantRules";

describe("pgmqEmailWrapperGrantRules — resolved grant contract", () => {
  it("pins browser roles off the four pgmq wrappers", () => {
    expect(clientRoleMayExecutePgmqWrapper("anon")).toBe(false);
    expect(clientRoleMayExecutePgmqWrapper("authenticated")).toBe(false);
  });

  it("service-role-only matrix is anon=false, authenticated=false, service role=true", () => {
    const matrix = serviceRoleOnlyExecute();
    expect(matrix.anon).toBe(false);
    expect(matrix.authenticated).toBe(false);
    expect(matrix[EXECUTE_ROLE_SERVICE]).toBe(true);
  });

  it("trigger-only matrix denies every client role including the service role", () => {
    const matrix = noClientExecute();
    expect(matrix.anon).toBe(false);
    expect(matrix.authenticated).toBe(false);
    expect(matrix[EXECUTE_ROLE_SERVICE]).toBe(false);
  });

  it("quicklog_save_manual keeps authenticated and the service role", () => {
    const matrix = authenticatedAndServiceRoleExecute();
    expect(matrix.anon).toBe(false);
    expect(matrix.authenticated).toBe(true);
    expect(matrix[EXECUTE_ROLE_SERVICE]).toBe(true);
  });

  it("quicklog_save_event is authenticated-only (no service-role EXECUTE)", () => {
    const matrix = authenticatedOnlyExecute();
    expect(matrix.anon).toBe(false);
    expect(matrix.authenticated).toBe(true);
    expect(matrix[EXECUTE_ROLE_SERVICE]).toBe(false);
  });

  it("assigns the service-role-only posture to every pgmq wrapper", () => {
    for (const name of PGMQ_EMAIL_WRAPPER_FUNCTIONS) {
      expect(
        executeMatricesMatch(expectedExecuteForHardenableDefiner(name), serviceRoleOnlyExecute()),
        name,
      ).toBe(true);
    }
  });

  it("assigns the trigger-only no-client posture to every trigger definer", () => {
    for (const name of TRIGGER_DEFINER_FUNCTIONS) {
      expect(
        executeMatricesMatch(expectedExecuteForHardenableDefiner(name), noClientExecute()),
        name,
      ).toBe(true);
    }
    expect(TRIGGER_DEFINER_FUNCTIONS).toContain("grant_staff_role_for_verified_allowlist");
  });

  it("does not claim identical ACLs for quicklog_save_manual and quicklog_save_event", () => {
    const manual = expectedExecuteForHardenableDefiner("quicklog_save_manual");
    const event = expectedExecuteForHardenableDefiner("quicklog_save_event");
    expect(executeMatricesMatch(manual, event)).toBe(false);
    expect(executeMatricesMatch(manual, authenticatedAndServiceRoleExecute())).toBe(true);
    expect(executeMatricesMatch(event, authenticatedOnlyExecute())).toBe(true);
  });

  it("covers every hardenable name through the exhaustive helper", () => {
    const all: HardenableDefinerFunction[] = [
      ...PGMQ_EMAIL_WRAPPER_FUNCTIONS,
      ...TRIGGER_DEFINER_FUNCTIONS,
      ...QUICKLOG_WRITER_FUNCTIONS,
    ];
    for (const name of all) {
      const matrix = expectedExecuteForHardenableDefiner(name);
      for (const role of CLIENT_EXECUTE_ROLES) {
        expect(typeof matrix[role]).toBe("boolean");
      }
      expect(publicSchemaFunctionName(name)).toBe(`public.${name}`);
    }
    expect(all).toHaveLength(9);
  });

  it("names the three additive migrations in apply order", () => {
    const paths = Object.values(PGMQ_EMAIL_WRAPPER_GRANT_MIGRATIONS);
    expect(paths[0] < paths[1]).toBe(true);
    expect(paths[1] < paths[2]).toBe(true);
    expect(paths[0]).toContain("20260815054529");
    expect(paths[1]).toContain("20260815054605");
    expect(paths[2]).toContain("20260815054645");
  });
});
