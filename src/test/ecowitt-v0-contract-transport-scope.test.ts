import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const JSON_PATH = resolve(__dirname, "../../docs/ecowitt-v0-live-ingest-contract.json");
const MD_PATH = resolve(__dirname, "../../docs/ecowitt-v0-live-ingest-contract.md");

const contract = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const md = readFileSync(MD_PATH, "utf8");

describe("ecowitt v0 cloud-direct transport scope", () => {
  it("keeps the cloud-direct worker in scope with the persistence gate closed", () => {
    expect(contract.transport_scope.cloud_direct_worker.in_scope).toBe(true);
    expect(contract.transport_scope.cloud_direct_worker.persistence_gate).toBe("closed");
  });

  it("states in the markdown that the persistence gate is CLOSED", () => {
    expect(md).toContain("persistence gate");
    expect(md).toContain("CLOSED");
  });
});
