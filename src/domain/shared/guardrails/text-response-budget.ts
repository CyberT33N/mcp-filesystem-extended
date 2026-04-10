/**
 * Shared text-budget projection and enforcement helpers for content-heavy endpoint families.
 *
 * @remarks
 * This module separates projected preflight budget checks from actual post-serialization budget
 * checks so endpoints can refuse oversized file-read, diff, or text-return workloads before they
 * generate heavy output, while the broader server shell still retains the final non-bypassable
 * response fuse as the last safety floor.
 */
import {
  createMetadataPreflightRejectedFailure,
  createRuntimeBudgetExceededFailure,
  formatToolGuardrailFailureAsText,
} from "./tool-guardrail-error-contract";

const BYTES_PER_TOKEN = 3;
const LINE_NUMBERED_RESPONSE_CHAR_MULTIPLIER = 1.35;
const LINE_NUMBERED_RESPONSE_CHAR_OVERHEAD = 64;
const DIFF_RESPONSE_CHAR_MULTIPLIER = 1.6;
const DIFF_RESPONSE_CHAR_OVERHEAD = 512;

function throwRuntimeBudgetExceededFailure(
  toolName: string,
  budgetSurface: string,
  measuredValue: number,
  limitValue: number,
): never {
  const failure = createRuntimeBudgetExceededFailure({
    toolName,
    budgetSurface,
    measuredValue,
    limitValue,
  });

  throw new Error(formatToolGuardrailFailureAsText(failure));
}

function throwMetadataPreflightRejectedFailure(
  toolName: string,
  preflightTarget: string,
  measuredValue: number,
  limitValue: number,
  reason: string,
  recommendedAction?: string,
): never {
  const failure = recommendedAction === undefined
    ? createMetadataPreflightRejectedFailure({
        toolName,
        preflightTarget,
        measuredValue,
        limitValue,
        reason,
      })
    : createMetadataPreflightRejectedFailure({
        toolName,
        preflightTarget,
        measuredValue,
        limitValue,
        reason,
        recommendedAction,
      });

  throw new Error(formatToolGuardrailFailureAsText(failure));
}

/**
 * Estimates token load from a raw byte count using the shared byte-to-token assumption.
 *
 * @param byteSize - Raw byte size that must be projected into token load.
 * @returns The projected token load derived from the shared byte-to-token ratio.
 */
export function estimateTokenLoadFromBytes(byteSize: number): number {
  return Math.ceil(byteSize / BYTES_PER_TOKEN);
}

/**
 * Estimates the projected line-numbered response size for metadata-first preflight decisions.
 *
 * @param byteSize - Raw byte size that will later be rendered with line numbers.
 * @returns The projected character budget for line-numbered output.
 */
export function estimateLineNumberedResponseCharsFromBytes(byteSize: number): number {
  return Math.ceil(byteSize * LINE_NUMBERED_RESPONSE_CHAR_MULTIPLIER) + LINE_NUMBERED_RESPONSE_CHAR_OVERHEAD;
}

/**
 * Estimates the projected diff-response size before the diff engine emits a large formatted body.
 *
 * @param leftByteSize - Byte size of the left-side input.
 * @param rightByteSize - Byte size of the right-side input.
 * @returns The projected character budget for the diff response surface.
 */
export function estimateDiffResponseCharsFromByteSizes(
  leftByteSize: number,
  rightByteSize: number,
): number {
  return Math.ceil((leftByteSize + rightByteSize) * DIFF_RESPONSE_CHAR_MULTIPLIER) + DIFF_RESPONSE_CHAR_OVERHEAD;
}

/**
 * Rejects projected text output that would exceed a hard character budget before serialization begins.
 *
 * @param toolName - Exact tool name that owns the projected response.
 * @param projectedChars - Projected character count before serialization.
 * @param hardCapChars - Hard character ceiling that must not be exceeded.
 * @param summary - Concise summary of the projected text surface being guarded.
 * @param recommendedAction - Optional retry guidance when projected preflight rejects require caller narrowing.
 * @returns Nothing when the projected output remains inside the hard cap.
 */
export function assertProjectedTextBudget(
  toolName: string,
  projectedChars: number,
  hardCapChars: number,
  summary: string,
  recommendedAction?: string,
): void {
  if (projectedChars <= hardCapChars) {
    return;
  }

  throwMetadataPreflightRejectedFailure(
    toolName,
    `Projected text budget: ${summary}`,
    projectedChars,
    hardCapChars,
    summary,
    recommendedAction,
  );
}

/**
 * Rejects actual text output that exceeds a hard character budget after serialization completes.
 *
 * @param toolName - Exact tool name that produced the response.
 * @param actualChars - Actual serialized character count.
 * @param hardCapChars - Hard character ceiling that must not be exceeded.
 * @param summary - Concise summary of the actual text surface being guarded.
 * @returns Nothing when the serialized output remains inside the hard cap.
 */
export function assertActualTextBudget(
  toolName: string,
  actualChars: number,
  hardCapChars: number,
  summary: string,
): void {
  if (actualChars <= hardCapChars) {
    return;
  }

  throwRuntimeBudgetExceededFailure(
    toolName,
    `Actual text budget: ${summary}`,
    actualChars,
    hardCapChars,
  );
}
