import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import McpApiReference from "@/pages/McpApiReference";
import { EcowittIngestValidationPanel } from "@/components/EcowittIngestValidationPanel";
import type { EcowittIngestValidationInput } from "@/lib/ecowittIngestValidationViewModel";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: vi.fn(),
}));

vi.mock("@/components/BrandLogo", () => ({
  default: () => <span>Verdant</span>,
}));

vi.mock("@/components/mcp/McpToolExplorer", () => ({
  default: () => <div data-testid="mcp-tool-explorer" />,
}));

const NOW = new Date("2026-07-26T12:00:00Z");
const TENT_ID = "11111111-2222-3333-4444-555555555555";
const MCP_COPY_ERROR = "Could not copy to clipboard. Select the code and copy it manually.";
const COMMAND_COPY_ERROR = "Could not copy command. Select the command and copy it manually.";
const EVIDENCE_COPY_ERROR =
  "Could not copy redacted evidence. Download the validation JSON instead.";

const acceptedEcowittInput: EcowittIngestValidationInput = {
  tentId: TENT_ID,
  now: NOW,
  rows: [
    {
      id: "row-1",
      source: "ecowitt",
      captured_at: "2026-07-26T11:58:00Z",
      ts: "2026-07-26T11:58:00Z",
      metric: "temp_f",
      raw_payload: {
        transport: "mqtt_local_test",
        test_sender: true,
        invalid_test: false,
        metrics: {
          temp_f: 77.9,
          humidity_pct: 55,
        },
        metadata: {
          transport: "mqtt_local_test",
          test_sender: true,
          invalid_test: false,
        },
      },
    },
  ],
};

let originalClipboard: PropertyDescriptor | undefined;

function setClipboard(value: { writeText: ReturnType<typeof vi.fn> } | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

function renderMcpReference() {
  return render(
    <MemoryRouter>
      <McpApiReference />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  toastError.mockReset();
  toastSuccess.mockReset();
});

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  } else {
    Reflect.deleteProperty(navigator, "clipboard");
  }
});

describe("MCP API reference clipboard feedback", () => {
  it("shows success only after the clipboard write resolves", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderMcpReference();

    fireEvent.click(screen.getAllByTestId("mcp-api-copy-button")[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain(
      "https://knkwiiywfkbqznbxwqfh.supabase.co/functions/v1/mcp",
    );
    expect(screen.getAllByTestId("mcp-api-copy-button")[0]).toHaveTextContent("Copied");
    expect(toastSuccess).toHaveBeenCalledWith("Copied to clipboard");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports a rejected clipboard write without showing false success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
    setClipboard({ writeText });
    renderMcpReference();

    fireEvent.click(screen.getAllByTestId("mcp-api-copy-button")[0]);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(MCP_COPY_ERROR));
    expect(screen.getAllByTestId("mcp-api-copy-button")[0]).toHaveTextContent("Copy");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("reports clipboard unavailability without attempting a write", async () => {
    setClipboard(undefined);
    renderMcpReference();

    fireEvent.click(screen.getAllByTestId("mcp-api-copy-button")[0]);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(MCP_COPY_ERROR));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("EcoWitt validation clipboard feedback", () => {
  it("shows command success only after the clipboard write resolves", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<EcowittIngestValidationPanel input={acceptedEcowittInput} />);

    fireEvent.click(screen.getByTestId("copy-accepted-command-button"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`VERDANT_TENT_ID=${TENT_ID} bun run dev:send-ecowitt`);
    });
    expect(screen.getByTestId("copy-accepted-command-button")).toHaveTextContent("Copied");
    expect(toastSuccess).toHaveBeenCalledWith("Command copied to clipboard");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports a rejected command copy without showing false success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
    setClipboard({ writeText });
    render(<EcowittIngestValidationPanel input={acceptedEcowittInput} />);

    fireEvent.click(screen.getByTestId("copy-accepted-command-button"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(COMMAND_COPY_ERROR));
    expect(screen.getByTestId("copy-accepted-command-button")).toHaveTextContent(
      "Copy accepted test command",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("reports command clipboard unavailability without false success", async () => {
    setClipboard(undefined);
    render(<EcowittIngestValidationPanel input={acceptedEcowittInput} />);

    fireEvent.click(screen.getByTestId("copy-invalid-command-button"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(COMMAND_COPY_ERROR));
    expect(screen.getByTestId("copy-invalid-command-button")).toHaveTextContent(
      "Copy invalid test command",
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("closes the evidence dialog and reports success after a resolved write", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<EcowittIngestValidationPanel input={acceptedEcowittInput} />);

    fireEvent.click(screen.getByTestId("copy-latest-evidence-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-confirm-button"));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Redacted evidence copied");
    expect(toastError).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("copy-preview-dialog")).toBeNull());
  });

  it("keeps the evidence dialog open and reports a rejected write", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
    setClipboard({ writeText });
    render(<EcowittIngestValidationPanel input={acceptedEcowittInput} />);

    fireEvent.click(screen.getByTestId("copy-latest-evidence-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-confirm-button"));
    });

    expect(toastError).toHaveBeenCalledWith(EVIDENCE_COPY_ERROR);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("copy-preview-dialog")).toBeInTheDocument();
  });

  it("keeps the evidence dialog open when the clipboard is unavailable", async () => {
    setClipboard(undefined);
    render(<EcowittIngestValidationPanel input={acceptedEcowittInput} />);

    fireEvent.click(screen.getByTestId("copy-latest-evidence-button"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("copy-confirm-button"));
    });

    expect(toastError).toHaveBeenCalledWith(EVIDENCE_COPY_ERROR);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("copy-preview-dialog")).toBeInTheDocument();
  });
});
