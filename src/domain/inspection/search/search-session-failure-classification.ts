import { normalizeError } from "@shared/errors";

import { isTraversalRuntimeBudgetExceededError } from "@domain/shared/guardrails/traversal-runtime-budget";

/**
 * Canonical failure classes for errors raised inside a resume pass of a search session.
 */
export const SEARCH_RESUME_PASS_FAILURE_CLASSES = {
  PERMANENT: "permanent",
  TRANSIENT: "transient",
} as const;

/**
 * Failure class of one error raised inside a resume pass of a search session.
 */
export type SearchResumePassFailureClass =
  (typeof SEARCH_RESUME_PASS_FAILURE_CLASSES)[keyof typeof SEARCH_RESUME_PASS_FAILURE_CLASSES];

/**
 * Classifies one error raised inside a resume pass as session-preserving transient or
 * session-closing permanent.
 *
 * @remarks
 * The mapping is identity-based, not message-fragile: the shared guardrail refusal contract
 * carries a stable `Failure code:` identity, and the traversal runtime budget carries a typed
 * guard. Permanent failures are exactly the surfaces a session can never recover from — a
 * deleted or invalid root and the cumulative candidate-byte hard gap, both carried by
 * `metadata_preflight_rejected`. Time budgets, backend timeouts, and unclassified backend
 * failures stay transient so the persisted frontier survives and the caller can resume again
 * or narrow the scope.
 *
 * @param error - The failure raised by one root inside a resume pass.
 * @returns The failure class that decides whether the session frontier survives.
 */
export function classifySearchResumePassFailure(error: unknown): SearchResumePassFailureClass {
  if (isTraversalRuntimeBudgetExceededError(error)) {
    return SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT;
  }

  const message = normalizeError(error).message;

  if (message.includes("Failure code: metadata_preflight_rejected")) {
    return SEARCH_RESUME_PASS_FAILURE_CLASSES.PERMANENT;
  }

  return SEARCH_RESUME_PASS_FAILURE_CLASSES.TRANSIENT;
}
