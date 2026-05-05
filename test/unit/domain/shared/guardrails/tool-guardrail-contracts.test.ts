import { describe, expect, it } from "vitest";

import {
  createGlobalResponseFuseTriggeredFailure,
  createMetadataPreflightRejectedFailure,
  createRegexContentMatchContractRejectedFailure,
  createRegexRuntimeRejectedFailure,
  createRuntimeBudgetExceededFailure,
  createSchemaLimitExceededFailure,
  createToolGuardrailMetricValue,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import {
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  ENDPOINT_FAMILY_GUARDRAIL_LIMITS,
  FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS,
  GLOBAL_RESPONSE_HARD_CAP_CHARS,
  IDENTIFIER_MAX_CHARS,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
  READ_FILE_CONTENT_RESPONSE_CAP_CHARS,
  READ_FILES_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
  TOOL_GUARDRAIL_LIMITS,
} from "@domain/shared/guardrails/tool-guardrail-limits";

describe("tool guardrail contracts", () => {
  it("exposes canonical grouped limit surfaces with the expected same-concept relationships", () => {
    expect(TOOL_GUARDRAIL_LIMITS.IDENTIFIER_MAX_CHARS).toBe(
      IDENTIFIER_MAX_CHARS,
    );
    expect(
      ENDPOINT_FAMILY_GUARDRAIL_LIMITS.CONTENT_MUTATION_TOTAL_INPUT_CHARS,
    ).toBe(CONTENT_MUTATION_TOTAL_INPUT_CHARS);
    expect(
      TOOL_GUARDRAIL_LIMITS.INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
    ).toBe(
      INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES
        * INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS.length
        + 1,
    );
    expect(READ_FILE_CONTENT_RESPONSE_CAP_CHARS).toBe(
      READ_FILES_RESPONSE_CAP_CHARS,
    );
    expect(FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS).toBe(
      REGEX_SEARCH_RESPONSE_CAP_CHARS,
    );
    expect(ENDPOINT_FAMILY_GUARDRAIL_LIMITS.GLOBAL_RESPONSE_HARD_CAP_CHARS).toBe(
      GLOBAL_RESPONSE_HARD_CAP_CHARS,
    );
  });

  it("builds schema and metadata preflight failures with explicit units and retry guidance", () => {
    expect(createToolGuardrailMetricValue(42, "results")).toEqual({
      value: 42,
      unit: "results",
    });

    const schemaFailure = createSchemaLimitExceededFailure({
      toolName: "search_file_contents_by_regex",
      requestSurface: "search_file_contents_by_regex.maxResults",
      limitName: "maxResults",
      limitValue: 1_000,
      actualValue: 1_001,
    });

    expect(schemaFailure.code).toBe("schema_limit_exceeded");
    expect(schemaFailure.details).toEqual([
      "Rejected request surface: search_file_contents_by_regex.maxResults.",
      "Configured limit (maxResults): 1,000 results.",
      "Received value: 1,001 results.",
    ]);

    const metadataFailure = createMetadataPreflightRejectedFailure({
      toolName: "read_files_with_line_numbers",
      preflightTarget: "line-numbered read response",
      measuredValue: createToolGuardrailMetricValue(2_048, "bytes"),
      limitValue: createToolGuardrailMetricValue(1_024, "bytes"),
      reason: "Candidate byte budget exceeded",
      recommendedAction: "Split the file set into smaller requests.",
    });

    expect(metadataFailure.code).toBe("metadata_preflight_rejected");
    expect(metadataFailure.details).toEqual([
      "Preflight target: line-numbered read response.",
      "Measured or projected value: 2,048 bytes.",
      "Configured limit: 1,024 bytes.",
      "Reason: Candidate byte budget exceeded.",
    ]);
    expect(metadataFailure.recommendedAction).toBe(
      "Split the file set into smaller requests.",
    );
  });

  it("builds regex and runtime budget failures as deterministic structural contracts", () => {
    const regexFailure = createRegexRuntimeRejectedFailure({
      toolName: "search_file_contents_by_regex",
      patternSummary: "/preview-.*-mode/gim",
      reason: "The compiled regex overflowed the runtime matcher safeguards.",
      candidateBytes: createToolGuardrailMetricValue(4_096, "bytes"),
    });

    expect(regexFailure.code).toBe("regex_runtime_rejected");
    expect(regexFailure.details).toEqual([
      "Pattern summary: /preview-.*-mode/gim.",
      "Runtime reason: The compiled regex overflowed the runtime matcher safeguards..",
      "Candidate bytes considered before refusal: 4,096 bytes.",
    ]);

    const contentContractFailure =
      createRegexContentMatchContractRejectedFailure({
        toolName: "search_file_contents_by_regex",
        patternSummary: "/^/gim",
        reason: "The pattern can produce a zero-length match on sentinel input \"\".",
        candidateBytes: createToolGuardrailMetricValue(0, "bytes"),
      });

    expect(contentContractFailure.details[2]).toBe(
      "Contract boundary: This endpoint accepts only patterns that produce content-bearing matches and does not allow anchor-only or other zero-length matching patterns.",
    );

    const runtimeBudgetFailure = createRuntimeBudgetExceededFailure({
      toolName: "copy_paths",
      budgetSurface: "copy_paths.operations",
      measuredValue: 321,
      limitValue: 200,
    });

    expect(runtimeBudgetFailure.code).toBe("runtime_budget_exceeded");
    expect(runtimeBudgetFailure.details).toEqual([
      "Budget surface: copy_paths.operations.",
      "Measured or projected value: 321 operations.",
      "Configured limit: 200 operations.",
    ]);
  });

  it("formats the final plain-text refusal surface for the global response fuse deterministically", () => {
    const failureText = formatToolGuardrailFailureAsText(
      createGlobalResponseFuseTriggeredFailure({
        toolName: "read_files_with_line_numbers",
        projectedResponseChars: createToolGuardrailMetricValue(
          600_001,
          "characters",
        ),
        globalLimitChars: createToolGuardrailMetricValue(
          GLOBAL_RESPONSE_HARD_CAP_CHARS,
          "characters",
        ),
      }),
    );

    expect(failureText.split("\n")).toEqual([
      "Tool guardrail refusal: The global response fuse rejected the tool result because it exceeded the non-bypassable server cap.",
      "Tool: read_files_with_line_numbers",
      "Failure code: global_response_fuse_triggered",
      "Details:",
      "- Projected response size: 600,001 characters.",
      "- Global response cap: 600,000 characters.",
      "- The response was blocked after endpoint execution to protect the server-wide contract.",
      "Recommended action: Request a smaller result set or tighten the operation scope before retrying.",
    ]);
  });
});
