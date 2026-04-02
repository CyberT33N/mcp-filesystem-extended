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
