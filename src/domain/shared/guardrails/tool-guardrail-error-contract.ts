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
 * Canonical numeric guardrail value rendered with an explicit unit for developer-facing refusals.
 *
 * @remarks
 * Guardrail refusals must state the unit immediately after the number so callers can distinguish
 * between counts, characters, bytes, lines, or other bounded surfaces without reading endpoint
 * documentation first.
 */
export interface ToolGuardrailMetricValue {
  /**
   * Raw numeric value that crossed or defined the guardrail.
   */
  readonly value: number;

  /**
   * Human-readable unit label rendered directly after the formatted number.
   */
  readonly unit: string;
}

type ToolGuardrailValue = string | number | ToolGuardrailMetricValue;

const GUARDRAIL_NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

/**
 * Creates the canonical numeric display surface for guardrail refusal values.
 *
 * @param value - Raw numeric value that should appear in the refusal payload.
 * @param unit - Explicit unit label rendered directly after the formatted number.
 * @returns Canonical guardrail metric value used by the refusal builders.
 */
export function createToolGuardrailMetricValue(
  value: number,
  unit: string,
): ToolGuardrailMetricValue {
  return {
    value,
    unit,
  };
}

function formatToolGuardrailValue(
  value: ToolGuardrailValue,
  inferredUnit?: string,
): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return inferredUnit === undefined
      ? GUARDRAIL_NUMBER_FORMATTER.format(value)
      : `${GUARDRAIL_NUMBER_FORMATTER.format(value)} ${inferredUnit}`;
  }

  return `${GUARDRAIL_NUMBER_FORMATTER.format(value.value)} ${value.unit}`;
}

function inferUnitFromLimitName(limitName: string): string | undefined {
  const normalizedLimitName = limitName.toLowerCase();

  if (normalizedLimitName.includes("results")) {
    return "results";
  }

  if (normalizedLimitName.includes("files")) {
    return "files";
  }

  if (normalizedLimitName.includes("chars")) {
    return "characters";
  }

  if (normalizedLimitName.includes("bytes")) {
    return "bytes";
  }

  if (normalizedLimitName.includes("paths")) {
    return "paths";
  }

  if (normalizedLimitName.includes("roots")) {
    return "roots";
  }

  if (normalizedLimitName.includes("globs")) {
    return "glob patterns";
  }

  if (normalizedLimitName.includes("operations")) {
    return "operations";
  }

  if (normalizedLimitName.includes("pairs")) {
    return "pairs";
  }

  if (normalizedLimitName.includes("replacements")) {
    return "replacements";
  }

  return undefined;
}

function inferMetadataPreflightUnit(
  preflightTarget: string,
  reason: string,
): string | undefined {
  const normalizedSurface = `${preflightTarget} ${reason}`.toLowerCase();

  if (
    normalizedSurface.includes("byte") ||
    normalizedSurface.includes("bytes")
  ) {
    return "bytes";
  }

  if (
    normalizedSurface.includes("character") ||
    normalizedSurface.includes("characters") ||
    normalizedSurface.includes("chars") ||
    normalizedSurface.includes("text budget") ||
    normalizedSurface.includes("path length") ||
    normalizedSurface.includes("raw-text") ||
    normalizedSurface.includes("raw text")
  ) {
    return "characters";
  }

  if (normalizedSurface.includes("match location")) {
    return "match locations";
  }

  if (normalizedSurface.includes("operation")) {
    return "operations";
  }

  if (normalizedSurface.includes("root")) {
    return "roots";
  }

  if (normalizedSurface.includes("glob")) {
    return "glob patterns";
  }

  if (normalizedSurface.includes("path")) {
    return "paths";
  }

  return undefined;
}

function inferRuntimeBudgetUnit(budgetSurface: string): string | undefined {
  const normalizedSurface = budgetSurface.toLowerCase();

  if (
    normalizedSurface.includes("replacementtext") ||
    normalizedSurface.includes("text budget")
  ) {
    return "characters";
  }

  if (
    normalizedSurface.includes("byte") ||
    normalizedSurface.includes("bytes")
  ) {
    return "bytes";
  }

  if (
    normalizedSurface.includes("character") ||
    normalizedSurface.includes("characters") ||
    normalizedSurface.includes("chars") ||
    normalizedSurface.includes("output") ||
    normalizedSurface.includes("response") ||
    normalizedSurface.includes("summary") ||
    normalizedSurface.includes("content")
  ) {
    return "characters";
  }

  if (normalizedSurface.includes("match location")) {
    return "match locations";
  }

  if (normalizedSurface.includes("entries")) {
    return "entries";
  }

  if (normalizedSurface.includes("directories")) {
    return "directories";
  }

  if (
    normalizedSurface.includes("milliseconds") ||
    normalizedSurface.includes("runtime") ||
    normalizedSurface.includes("time budget")
  ) {
    return "milliseconds";
  }

  if (normalizedSurface.includes("results")) {
    return "results";
  }

  if (normalizedSurface.includes("files")) {
    return "files";
  }

  if (normalizedSurface.includes("operation")) {
    return "operations";
  }

  if (normalizedSurface.includes("root")) {
    return "roots";
  }

  if (normalizedSurface.includes("glob")) {
    return "glob patterns";
  }

  if (normalizedSurface.includes("path")) {
    return "paths";
  }

  return undefined;
}

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
  limitValue: ToolGuardrailValue;
  actualValue: ToolGuardrailValue;
}): ToolGuardrailFailure {
  const inferredUnit = inferUnitFromLimitName(params.limitName);

  return createToolGuardrailFailure(
    "schema_limit_exceeded",
    params.toolName,
    "Request validation rejected because the request exceeds a hard schema guardrail.",
    [
      `Rejected request surface: ${params.requestSurface}.`,
      `Configured limit (${params.limitName}): ${formatToolGuardrailValue(params.limitValue, inferredUnit)}.`,
      `Received value: ${formatToolGuardrailValue(params.actualValue, inferredUnit)}.`,
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
  measuredValue: ToolGuardrailValue;
  limitValue: ToolGuardrailValue;
  reason: string;
  recommendedAction?: string;
}): ToolGuardrailFailure {
  const inferredUnit = inferMetadataPreflightUnit(params.preflightTarget, params.reason);

  return createToolGuardrailFailure(
    "metadata_preflight_rejected",
    params.toolName,
    "Request rejected during metadata preflight before content execution began.",
    [
      `Preflight target: ${params.preflightTarget}.`,
      `Measured or projected value: ${formatToolGuardrailValue(params.measuredValue, inferredUnit)}.`,
      `Configured limit: ${formatToolGuardrailValue(params.limitValue, inferredUnit)}.`,
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
  candidateBytes: ToolGuardrailValue;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "regex_runtime_rejected",
    params.toolName,
    "Regex execution rejected because runtime safety detected an unsafe or unbounded search condition.",
    [
      `Pattern summary: ${params.patternSummary}.`,
      `Runtime reason: ${params.reason}.`,
      `Candidate bytes considered before refusal: ${formatToolGuardrailValue(params.candidateBytes, "bytes")}.`,
    ],
    "Tighten the regex scope or simplify the pattern before retrying.",
  );
}

/**
 * Creates the canonical refusal payload for regex patterns that are out of contract for
 * content-match search because they can only produce zero-length or other non-content-bearing
 * matches.
 *
 * @param params - Describes the rejected content-search pattern and the contract reason.
 * @returns A deterministic regex contract refusal payload.
 */
export function createRegexContentMatchContractRejectedFailure(params: {
  toolName: string;
  patternSummary: string;
  reason: string;
  candidateBytes: ToolGuardrailValue;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "regex_runtime_rejected",
    params.toolName,
    "Regex execution rejected because the pattern is out of contract for this content-search endpoint.",
    [
      `Pattern summary: ${params.patternSummary}.`,
      `Runtime reason: ${params.reason}.`,
      "Contract boundary: This endpoint accepts only patterns that produce content-bearing matches and does not allow anchor-only or other zero-length matching patterns.",
      `Candidate bytes considered before refusal: ${formatToolGuardrailValue(params.candidateBytes, "bytes")}.`,
    ],
    "Use a regex that consumes content characters for this endpoint, or switch to a dedicated anchor/position search surface for zero-width matching.",
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
  measuredValue: ToolGuardrailValue;
  limitValue: ToolGuardrailValue;
}): ToolGuardrailFailure {
  const inferredUnit = inferRuntimeBudgetUnit(params.budgetSurface);

  return createToolGuardrailFailure(
    "runtime_budget_exceeded",
    params.toolName,
    "Request execution exceeded a runtime guardrail budget before a safe result could be returned.",
    [
      `Budget surface: ${params.budgetSurface}.`,
      `Measured or projected value: ${formatToolGuardrailValue(params.measuredValue, inferredUnit)}.`,
      `Configured limit: ${formatToolGuardrailValue(params.limitValue, inferredUnit)}.`,
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
  projectedResponseChars: ToolGuardrailValue;
  globalLimitChars: ToolGuardrailValue;
}): ToolGuardrailFailure {
  return createToolGuardrailFailure(
    "global_response_fuse_triggered",
    params.toolName,
    "The global response fuse rejected the tool result because it exceeded the non-bypassable server cap.",
    [
      `Projected response size: ${formatToolGuardrailValue(params.projectedResponseChars, "characters")}.`,
      `Global response cap: ${formatToolGuardrailValue(params.globalLimitChars, "characters")}.`,
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
