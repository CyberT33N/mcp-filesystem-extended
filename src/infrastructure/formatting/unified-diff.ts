import { createTwoFilesPatch } from 'diff';

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function createUnifiedDiff(
  originalContent: string,
  newContent: string,
  originalFilePath: string = 'file1',
  newFilePath: string = 'file2'
): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);

  return createTwoFilesPatch(
    originalFilePath,
    newFilePath,
    normalizedOriginal,
    normalizedNew,
    'original',
    'modified'
  );
}

/**
 * Wraps a unified diff string in a fenced code block, dynamically selecting
 * the minimum number of backticks needed to avoid premature fence closure.
 *
 * @param diff - Raw unified diff string from `createUnifiedDiff`.
 * @returns Fenced diff block safe for embedding in Markdown output.
 */
export function wrapDiffInSafeFencedBlock(diff: string): string {
  let numBackticks = 3;
  while (diff.includes("`".repeat(numBackticks))) {
    numBackticks++;
  }
  return `${"`".repeat(numBackticks)}diff\n${diff}${"`".repeat(numBackticks)}`;
}