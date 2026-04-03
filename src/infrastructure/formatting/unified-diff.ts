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