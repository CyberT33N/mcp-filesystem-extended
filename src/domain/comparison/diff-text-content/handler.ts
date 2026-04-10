import {
  MAX_TOTAL_RAW_TEXT_REQUEST_CHARS,
  TEXT_DIFF_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  createMetadataPreflightRejectedFailure,
  formatToolGuardrailFailureAsText,
} from "@domain/shared/guardrails/tool-guardrail-error-contract";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter";
import { createUnifiedDiff } from "@infrastructure/formatting/unified-diff";

/**
 * Caller-supplied in-memory text pair for the raw diff endpoint.
 *
 * @remarks
 * This surface accepts arbitrary text directly from the request body, so the endpoint applies a
 * stricter cumulative raw-text budget than the file-backed diff family before diff generation
 * begins.
 */
interface DiffTextContentPair {
  content1: string;
  content2: string;
  label1: string;
  label2: string;
}

/**
 * Rejects oversize in-memory diff requests before unified diff generation begins.
 *
 * @param operations - Raw-text diff pairs requested by the caller.
 * @returns Nothing. The function throws when the cumulative raw-text request budget is exceeded.
 */
function assertTotalRawTextRequestChars(operations: DiffTextContentPair[]): void {
  const totalRawTextRequestChars = operations.reduce(
    (total, operation) => total + operation.content1.length + operation.content2.length,
    0,
  );

  if (totalRawTextRequestChars <= MAX_TOTAL_RAW_TEXT_REQUEST_CHARS) {
    return;
  }

  throw new Error(
    formatToolGuardrailFailureAsText(
      createMetadataPreflightRejectedFailure({
        toolName: "diff_text_content",
        preflightTarget: "Cumulative raw text request content",
        measuredValue: totalRawTextRequestChars,
        limitValue: MAX_TOTAL_RAW_TEXT_REQUEST_CHARS,
        reason: "The in-memory diff request exceeds the cumulative raw-text budget before diff generation.",
        recommendedAction: "Reduce the number of pairs or shorten the compared content before retrying.",
      }),
    ),
  );
}

/**
 * Builds one formatted unified diff block for a caller-supplied in-memory text pair.
 *
 * @param operation - Raw-text pair that should be rendered as a unified diff block.
 * @returns A fenced diff block with a delimiter that remains safe for the emitted output.
 */
async function getFormattedContentDiff(operation: DiffTextContentPair): Promise<string> {
  const diff = createUnifiedDiff(
    operation.content1,
    operation.content2,
    operation.label1,
    operation.label2
  );

  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }

  return `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}`;
}

/**
 * Returns unified diffs for one or more caller-supplied in-memory text pairs.
 *
 * @remarks
 * This comparison surface is intentionally stricter than file-backed diffs because callers can
 * inject arbitrary raw text directly into the request. The handler therefore refuses oversize
 * cumulative input before diff generation and enforces the comparison-family response budget after
 * formatting so successful output remains complete rather than silently truncated.
 *
 * @param operations - In-memory text pairs that should be compared.
 * @returns Unified diff output for a single pair or a deterministic batch summary for multiple
 * pairs.
 */
export async function handleContentDiff(
  operations: DiffTextContentPair[]
): Promise<string> {
  assertTotalRawTextRequestChars(operations);

  if (operations.length === 1) {
    const output = await getFormattedContentDiff(operations[0]!);

    assertActualTextBudget(
      "diff_text_content",
      output.length,
      TEXT_DIFF_RESPONSE_CAP_CHARS,
      "Text diff output exceeds the text-diff family cap.",
    );

    return output;
  }

  const results = await Promise.all(
    operations.map(async (operation, index) => {
      try {
        const output = await getFormattedContentDiff(operation);
        return {
          label: `${operation.label1} ↔ ${operation.label2} (#${index + 1})`,
          output,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          label: `${operation.label1} ↔ ${operation.label2} (#${index + 1})`,
          error: errorMessage,
        };
      }
    })
  );

  const output = formatBatchTextOperationResults("diff text content", results);

  assertActualTextBudget(
    "diff_text_content",
    output.length,
    TEXT_DIFF_RESPONSE_CAP_CHARS,
    "Text diff output exceeds the text-diff family cap.",
  );

  return output;
}
