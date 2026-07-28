import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SchemaAuditMigrationDrilldown from "@/components/SchemaAuditMigrationDrilldown";

const filename = "20260619083000_add_soil_moisture_calibration_v1.sql";

describe("SchemaAuditMigrationDrilldown", () => {
  it("renders each expected column as present, missing, or unverified from parent evidence", () => {
    render(
      <SchemaAuditMigrationDrilldown
        open
        onOpenChange={vi.fn()}
        filename={filename}
        version="20260619083000"
        applied
        matchKind="exact_version"
        snapshotReady={false}
        tableExistence={{ soil_moisture_calibrations: true }}
        columnEvidence={{
          "soil_moisture_calibrations.id": true,
          "soil_moisture_calibrations.user_id": false,
        }}
      />,
    );

    expect(
      screen.getByTestId("schema-audit-column-status-soil_moisture_calibrations.id"),
    ).toHaveTextContent("present");
    expect(
      screen.getByTestId("schema-audit-column-status-soil_moisture_calibrations.user_id"),
    ).toHaveTextContent("missing");
    expect(
      screen.getByTestId("schema-audit-column-status-soil_moisture_calibrations.grow_id"),
    ).toHaveTextContent("unverified");
  });

  it("labels ambiguous ledger collisions instead of treating them as applied", () => {
    render(
      <SchemaAuditMigrationDrilldown
        open
        onOpenChange={vi.fn()}
        filename={filename}
        version="20260619083000"
        applied={false}
        matchKind="ambiguous"
        snapshotReady={false}
        tableExistence={{}}
        columnEvidence={{}}
      />,
    );
    expect(screen.getByText("ambiguous ledger match")).toBeInTheDocument();
  });
});
