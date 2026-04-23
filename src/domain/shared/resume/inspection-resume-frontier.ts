/**
 * Minimal traversal-frame contract shared by preview-family and completion-backed resume frontiers.
 */
export interface InspectionResumeTraversalFrame {
  /**
   * Relative directory path currently owned by the frame.
   */
  directoryRelativePath: string;

  /**
   * Next entry index that is pending commit for the current frame.
   */
  nextEntryIndex: number;
}

/**
 * Clones traversal frames so persisted resume state never reuses mutable loop references.
 *
 * @param traversalFrames - Traversal frames that should be persisted or replayed safely.
 * @returns Detached traversal-frame copies.
 */
export function cloneInspectionResumeTraversalFrames<T extends InspectionResumeTraversalFrame>(
  traversalFrames: T[],
): T[] {
  return traversalFrames.map((traversalFrame) => ({ ...traversalFrame }));
}

/**
 * Commits one active traversal entry only after the current candidate has been emitted or
 * explicitly persisted as the next pending unit.
 *
 * @param traversalFrame - Active traversal frame that owns the current candidate entry.
 */
export function commitInspectionResumeTraversalEntry<T extends InspectionResumeTraversalFrame>(
  traversalFrame: T,
): void {
  traversalFrame.nextEntryIndex += 1;
}
