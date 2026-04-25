import {
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";

/**
 * Enforces the shared path-mutation batch-size ceiling before any filesystem
 * mutation begins.
 *
 * @remarks
 * Kept in the mutation domain shared layer so path-mutation handlers can import
 * a single assert function rather than each duplicating the inline guardrail check.
 *
 * @param toolName - Exact MCP tool name that owns the mutation request.
 * @param operationCount - Number of operations in the incoming batch.
 * @returns Nothing when the operation count is within the ceiling.
 */
export function assertPathMutationBatchBudget(
  toolName: string,
  operationCount: number,
): void {
  if (operationCount <= MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST) {
    return;
  }

  throw new Error(
    formatToolGuardrailFailureAsText(
      createRuntimeBudgetExceededFailure({
        toolName,
        budgetSurface: `${toolName}.operations`,
        measuredValue: operationCount,
        limitValue: MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
      }),
    ),
  );
}

/**
 * Enforces the shared content-bearing mutation cumulative input-character ceiling
 * before any filesystem write begins.
 *
 * @param toolName - Exact MCP tool name that owns the mutation request.
 * @param files - Content-bearing file entries whose character counts sum to the total.
 * @returns Nothing when the cumulative input is within the ceiling.
 */
export function assertContentMutationInputBudget(
  toolName: string,
  files: ReadonlyArray<{ readonly content: string }>,
): void {
  const totalInputChars = files.reduce(
    (totalChars, file) => totalChars + file.content.length,
    0,
  );

  if (totalInputChars <= CONTENT_MUTATION_TOTAL_INPUT_CHARS) {
    return;
  }

  throw new Error(
    formatToolGuardrailFailureAsText(
      createRuntimeBudgetExceededFailure({
        toolName,
        budgetSurface: "Cumulative content-bearing mutation input characters",
        measuredValue: totalInputChars,
        limitValue: CONTENT_MUTATION_TOTAL_INPUT_CHARS,
      }),
    ),
  );
}
