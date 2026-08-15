export const SPIKE_NAME = "VERDANT_CURSOR_SDK_LOCAL_ORCHESTRATION_SPIKE";
export const SDK_PACKAGE = "@cursor/sdk";
export const SDK_PINNED_VERSION = "1.0.28";
export const FINDING_SCHEMA_VERSION = "1.0.0";
export const RECEIPT_SCHEMA_VERSION = "cursor-sdk-local-orchestration-receipt/1.0.0";
export const FIXED_CATALOG_MODEL_ID = "composer-2.5";
export const FORBIDDEN_MODEL_IDS = Object.freeze(["auto-smart", "auto", "router"]);
export const MAX_RUNS = 2;
export const MAX_RETRYABLE_ATTEMPTS = 2;
export const DEFAULT_WALL_CLOCK_MS = 120_000;
export const DEFAULT_TOKEN_BUDGET = 50_000;
export const PRE_RUN_SPEND_CONTROL = "BLOCKED" as const;
export const SYNTHETIC_MARKER_FILENAME = "SYNTHETIC_VERDANT_FIXTURE.md";
export const EXTERNAL_CANARY_FILENAME = "outside-canary.synthetic.txt";
export const IMMUTABLE_FILENAME = "immutable-hash-anchor.synthetic.txt";

export const EXPLICIT_FIXTURE_FILES = Object.freeze([
  SYNTHETIC_MARKER_FILENAME,
  "diary-note.synthetic.json",
  "sensor-manual.synthetic.json",
  "sensor-demo.synthetic.json",
  "sensor-invalid.synthetic.json",
  "billing-record.synthetic.json",
  "ai-credit-record.synthetic.json",
  "secret-canary.synthetic.txt",
  "prompt-injection.synthetic.txt",
  IMMUTABLE_FILENAME,
]);

/**
 * Curated ToolName literals from @cursor/sdk@1.0.28 options.d.ts.
 * Inspected from the installed package; do not invent names.
 */
export const CURATED_TOOL_NAMES = Object.freeze([
  "shell",
  "read",
  "edit",
  "grep",
  "glob",
  "ls",
  "task",
  "mcp",
  "webSearch",
  "delete",
  "readLints",
  "webFetch",
  "semSearch",
  "updateTodos",
  "readTodos",
  "askQuestion",
  "await",
  "generateImage",
  "applyAgentDiff",
] as const);

/**
 * Additional public tool-call `type` literals from the same SDK's
 * vendor tool-call-types.d.ts that are missing from the ToolName
 * autocomplete union. Passing these is type-legal because ToolName
 * includes `(string & {})`. Runtime unknown names throw ConfigurationError.
 */
export const VENDOR_TOOL_CALL_TYPES = Object.freeze([
  "write",
  "recordScreen",
  "createPlan",
] as const);

export const ALLOWED_TOOLS = Object.freeze(["read"] as const);

export const CANDIDATE_DISALLOWED_TOOLS = Object.freeze([
  "shell",
  "edit",
  "write",
  "task",
  "mcp",
  "webSearch",
] as const);

export const REQUIRED_DISALLOWED_TOOLS = Object.freeze(
  [
    ...CANDIDATE_DISALLOWED_TOOLS,
    "delete",
    "applyAgentDiff",
    "webFetch",
    "grep",
    "glob",
    "ls",
    "semSearch",
    "updateTodos",
    "readLints",
    "readTodos",
    "askQuestion",
    "await",
    "generateImage",
    "recordScreen",
    "createPlan",
  ].slice().sort(),
);

export const FORBIDDEN_RECEIPT_FIELD_NAMES = Object.freeze([
  "key",
  "token",
  "prompt",
  "checkpoint",
  "agentId",
  "runId",
  "requestId",
  "apiKey",
  "CURSOR_API_KEY",
]);

export const SECRET_SHAPED_PATTERNS = Object.freeze([
  /sk_test_[A-Za-z0-9_]+/g,
  /CURSOR_API_KEY\s*=\s*\S+/g,
  /SYNTHETIC_SECRET_CANARY=\S+/g,
  /cus_SYNTHETIC_[A-Za-z0-9_]+/g,
]);
