import path from "path";

/**
 * Compares a stored symbolic-link target against an expected target text.
 *
 * @remarks
 * Symbolic links store their target text verbatim, but the operating system
 * owns the stored separator form: Windows stores targets with normalized
 * backslash separators even when the link was created with forward slashes.
 * Comparison therefore normalizes both sides through the platform path
 * normalization before exact equality, so the semantic path identity is
 * compared without hiding target drift. On POSIX, a backslash stays a legal
 * filename character and is never rewritten into a path separator.
 *
 * @param actualTarget - Verbatim target text read from the link.
 * @param expectedTarget - Caller-supplied expected target text.
 * @returns True when both target texts denote the same path after trimming and platform separator normalization.
 */
export function symbolicLinkTargetsMatch(
  actualTarget: string,
  expectedTarget: string,
): boolean {
  return path.normalize(actualTarget.trim()) === path.normalize(expectedTarget.trim());
}
