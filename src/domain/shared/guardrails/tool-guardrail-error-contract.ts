/**
 * Defines the canonical refusal contract shared by every guardrail layer that can reject an MCP
 * tool request or result.
 *
 * @remarks
 * The shared builders keep refusal wording deterministic across schema validation,
 * metadata-first preflight, endpoint runtime fuses, and the final global response fuse so LLM
 * callers receive stable remediation guidance instead of endpoint-local phrasing drift or implied
 * override paths.
 */

/**
 * Enumerates the canonical refusal categories emitted by shared guardrail enforcement.
 */
export type ToolGuardrailFailureCode =
  | "schema_limit_exceeded"
  | "metadata_preflight_rejected"
  | "regex_runtime_rejected"
  | "runtime_budget_exceeded"
  | "global_response_fuse_triggered";

/**
 * Describes the canonical refusal payload shared by schemas, handlers, and the global response fuse.
 */
export interface ToolGuardrailFailure {
  /**
   * Stable refusal code that identifies the guardrail category.
   */
  readonly code: ToolGuardrailFailureCode;

  /**
   * Exact MCP tool name that triggered the refusal.
   */
  readonly toolName: string;

  /**
   * One concise English sentence summarizing why execution was rejected.
   */
  readonly summary: string;

  /**
   * Ordered English detail lines that explain the refusal deterministically.
   */
  readonly details: readonly string[];

  /**
   * One concise English instruction that guides the caller toward a safer retry by narrowing scope
   * or reducing payload, never by bypassing the hard cap.
   */
  readonly recommendedAction: string;
}

/**
 * Creates a canonical guardrail failure object from fully specified English message parts.
 *
 * @param code - Stable refusal category for the failure.
 * @param toolName - Exact MCP tool name that triggered the refusal.
 * @param summary - Concise English refusal summary.
 * @param details - Ordered English detail lines for deterministic rendering.
 * @param recommendedAction - Concise English retry guidance.
 * @returns The canonical refusal payload shared by schema, preflight, runtime, and global-fuse enforcement surfaces.
 */
export function createToolGuardrailFailure(
  code: ToolGuardrailFailureCode,
  toolName: string,
  summary: string,
  details: readonly string[],
  recommendedAction: string,
): ToolGuardrailFailure {
  return {
    code,
    toolName,
    summary,
    details,
    recommendedAction,
  };
}

/**
 * Creates the canonical refusal payload for schema-level hard limit violations.
 *
 * @param params - Describes the rejected request surface and the configured hard limit.
 * @returns A deterministic schema guardrail refusal payload.
 */
export function createSchemaLimitExceededFailure(params: {
  toolName: string;
  requestSurface: string;
  limitName: string;
  limitValue: string | number;
  actualValue: string | number;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "schema_limit_exceeded",
    params.toolName,
    "Request validation rejected because the request exceeds a hard schema guardrail.",
    [
      `Rejected request surface: ${params.requestSurface}.`,
      `Configured limit (${params.limitName}): ${String(params.limitValue)}.`,
      `Received value: ${String(params.actualValue)}.`,
    ],
    "Reduce the request size or split the work into smaller batches before retrying.",
  );
}

/**
 * Creates the canonical refusal payload for metadata-first preflight rejections.
 *
 * @param params - Describes the preflight target, the measured or projected value, and the blocking limit.
 * @returns A deterministic metadata preflight refusal payload.
 */
export function createMetadataPreflightRejectedFailure(params: {
  toolName: string;
  preflightTarget: string;
  measuredValue: string | number;
  limitValue: string | number;
  reason: string;
  recommendedAction?: string;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "metadata_preflight_rejected",
    params.toolName,
    "Request rejected during metadata preflight before content execution began.",
    [
      `Preflight target: ${params.preflightTarget}.`,
      `Measured or projected value: ${String(params.measuredValue)}.`,
      `Configured limit: ${String(params.limitValue)}.`,
      `Reason: ${params.reason}.`,
    ],
    params.recommendedAction ?? "Narrow the target set or reduce the expected payload before retrying.",
  );
}

/**
 * Creates the canonical refusal payload for unsafe regex runtime behavior.
 *
 * @param params - Describes the runtime regex condition that triggered the refusal.
 * @returns A deterministic regex runtime refusal payload.
 */
export function createRegexRuntimeRejectedFailure(params: {
  toolName: string;
  patternSummary: string;
  reason: string;
  candidateBytes: string | number;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "regex_runtime_rejected",
    params.toolName,
    "Regex execution rejected because runtime safety detected an unsafe or unbounded search condition.",
    [
      `Pattern summary: ${params.patternSummary}.`,
      `Runtime reason: ${params.reason}.`,
      `Candidate bytes considered before refusal: ${String(params.candidateBytes)}.`,
    ],
    "Tighten the regex scope or simplify the pattern before retrying.",
  );
}

/**
 * Creates the canonical refusal payload for family-specific runtime budget overruns.
 *
 * @param params - Describes the budget surface that exceeded its configured runtime ceiling.
 * @returns A deterministic runtime budget refusal payload.
 */
export function createRuntimeBudgetExceededFailure(params: {
  toolName: string;
  budgetSurface: string;
  measuredValue: string | number;
  limitValue: string | number;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "runtime_budget_exceeded",
    params.toolName,
    "Request execution exceeded a runtime guardrail budget before a safe result could be returned.",
    [
      `Budget surface: ${params.budgetSurface}.`,
      `Measured or projected value: ${String(params.measuredValue)}.`,
      `Configured limit: ${String(params.limitValue)}.`,
    ],
    "Reduce the result scope or split the operation into smaller units before retrying.",
  );
}

/**
 * Creates the canonical refusal payload for the non-bypassable server-shell response fuse.
 *
 * @param params - Describes the completed tool result that exceeded the final global response cap.
 * @returns A deterministic global response-fuse refusal payload.
 */
export function createGlobalResponseFuseTriggeredFailure(params: {
  toolName: string;
  projectedResponseChars: string | number;
  globalLimitChars: string | number;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "global_response_fuse_triggered",
    params.toolName,
    "The global response fuse rejected the tool result because it exceeded the non-bypassable server cap.",
    [
      `Projected response size: ${String(params.projectedResponseChars)} characters.`,
      `Global response cap: ${String(params.globalLimitChars)} characters.`,
      `The response was blocked after endpoint execution to protect the server-wide contract.`,
    ],
    "Request a smaller result set or tighten the operation scope before retrying.",
  );
}

/**
 * Renders the canonical refusal payload as deterministic plain text.
 *
 * @param failure - Canonical refusal payload produced by the shared builders.
 * @returns Stable plain-text output for tool surfaces that still respond with text content.
 */
export function formatToolGuardrailFailureAsText(failure: ToolGuardrailFailure): string {
  const detailLines = failure.details.map((detail) => `- ${detail}`);

  return [
    `Tool guardrail refusal: ${failure.summary}`,
    `Tool: ${failure.toolName}`,
    `Failure code: ${failure.code}`,
    "Details:",
    ...detailLines,
    `Recommended action: ${failure.recommendedAction}`,
  ].join("\n");
}
