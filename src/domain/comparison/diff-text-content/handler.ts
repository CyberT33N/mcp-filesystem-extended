import { formatBatchTextOperationResults } from "@infrastructure/formatting/batch-result-formatter.js";
import { createUnifiedDiff } from "@infrastructure/formatting/unified-diff.js";

interface ContentDiffOperation {
  content1: string;
  content2: string;
  label1: string;
  label2: string;
}

async function getFormattedContentDiff(operation: ContentDiffOperation): Promise<string> {
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

export async function handleContentDiff(
  operations: ContentDiffOperation[]
): Promise<string> {
  if (operations.length === 1) {
    return getFormattedContentDiff(operations[0]);
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

  return formatBatchTextOperationResults("content diff", results);
}
