export interface BatchTextOperationResult {
  /**
   * Human-readable label for the processed operation.
   */
  label: string;

  /**
   * Successful operation output.
   */
  output?: string;

  /**
   * Operation error message.
   */
  error?: string;
}

function formatSuccessLine(count: number): string {
  return count === 1
    ? "- 1 operation completed successfully"
    : `- ${count} operations completed successfully`;
}

function formatErrorLine(count: number): string {
  return count === 1
    ? "- 1 operation failed"
    : `- ${count} operations failed`;
}

/**
 * Formats parallel batch-operation results into a deterministic text report.
 *
 * @param operationLabel - Stable label that identifies the endpoint or operation family.
 * @param results - Collected per-operation outputs and errors in request order.
 * @returns Human-readable batch summary text.
 */
export function formatBatchTextOperationResults(
  operationLabel: string,
  results: BatchTextOperationResult[]
): string {
  const successes = results.filter((result) => result.error === undefined);
  const failures = results.filter((result) => result.error !== undefined);

  let output = `Processed ${results.length} ${operationLabel} operations:\n`;
  output += `${formatSuccessLine(successes.length)}\n`;

  if (failures.length > 0) {
    output += `${formatErrorLine(failures.length)}\n`;
  }

  if (successes.length > 0) {
    const successBlocks = successes
      .map((result, index) => {
        const formattedOutput = result.output?.trim() ?? "";
        return `[${index + 1}] ${result.label}\n${formattedOutput}`.trimEnd();
      })
      .join("\n\n");

    output += `\nResults:\n${successBlocks}`;
  }

  if (failures.length > 0) {
    const errorLines = failures
      .map((result) => `- ${result.label}: ${result.error}`)
      .join("\n");

    output += `\n\nErrors:\n${errorLines}`;
  }

  return output;
}

/**
 * Formats a concise batch mutation summary line suitable for path-mutation and
 * content-mutation handler responses.
 *
 * @remarks
 * This helper keeps mutation output concise and consistent across all handlers
 * that currently hand-build the same `Processed N items: ...` string pattern.
 * Mutation endpoints must never echo large content bodies back to the caller.
 *
 * @param operationNoun - Plural English noun describing the mutation target (e.g. "files", "paths", "directories").
 * @param successCount - Number of successfully completed operations.
 * @param errors - Error messages for each failed operation.
 * @returns Concise formatted summary string.
 */
export function formatBatchMutationSummary(
  operationNoun: string,
  successCount: number,
  errors: readonly string[],
): string {
  const errorCount = errors.length;
  let output = `Processed ${successCount + errorCount} ${operationNoun}:\n`;
  output += `- ${successCount} ${operationNoun} processed successfully\n`;

  if (errorCount > 0) {
    output += `- ${errorCount} ${operationNoun} failed\n\n`;
    output += "Errors:\n" + errors.join("\n");
  }

  return output;
}
