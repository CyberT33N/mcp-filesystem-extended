import {
  createRuntimeBudgetExceededFailure,
  createToolGuardrailMetricValue,
  formatToolGuardrailFailureAsText,
} from "./tool-guardrail-error-contract";
import {
  TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES,
  TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES,
  TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS,
} from "./tool-guardrail-limits";

/**
 * Mutable traversal runtime counters shared by traversal-heavy endpoint families.
 *
 * @remarks
 * These counters support deterministic refusal behavior for oversized traversals. They exist so
 * recursive inspection surfaces can stop before broad scans degrade runtime stability or timeout.
 */
export interface TraversalRuntimeBudgetState {
  /**
   * Timestamp captured when the guarded traversal began.
   */
  readonly startedAtMs: number;

  /**
   * Number of filesystem entries visited so far.
   */
  visitedEntries: number;

  /**
   * Number of directories opened or descended into so far.
   */
  visitedDirectories: number;
}

/**
 * Overrideable traversal-runtime ceilings used when a bounded execution lane must stay below the
 * deeper emergency safeguard.
 */
export interface TraversalRuntimeBudgetLimits {
  /**
   * Maximum number of filesystem entries that the current traversal lane may visit.
   */
  maxVisitedEntries: number;

  /**
   * Maximum number of directories that the current traversal lane may descend into.
   */
  maxVisitedDirectories: number;

  /**
   * Soft wall-clock runtime budget in milliseconds for the current traversal lane.
   */
  softTimeBudgetMs: number;
}

const DEFAULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS: TraversalRuntimeBudgetLimits = {
  maxVisitedEntries: TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES,
  maxVisitedDirectories: TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES,
  softTimeBudgetMs: TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS,
};

/**
 * Structured error raised when the shared traversal runtime safeguard aborts one recursive workload.
 */
export class TraversalRuntimeBudgetExceededError extends Error {
  constructor(
    message: string,
    readonly toolName: string,
    readonly budgetSurface: string,
    readonly measuredValue: number,
    readonly limitValue: number,
    readonly unit: string,
  ) {
    super(message);
    this.name = "TraversalRuntimeBudgetExceededError";
  }
}

/**
 * Type guard for traversal runtime safeguard failures.
 *
 * @param error - Unknown thrown value that may represent a traversal safeguard refusal.
 * @returns `true` when the error originated from the shared traversal runtime safeguard.
 */
export function isTraversalRuntimeBudgetExceededError(
  error: unknown,
): error is TraversalRuntimeBudgetExceededError {
  return error instanceof TraversalRuntimeBudgetExceededError;
}

function throwTraversalRuntimeBudgetExceededFailure(
  toolName: string,
  budgetSurface: string,
  measuredValue: number,
  limitValue: number,
  unit: string,
  narrowingGuidance?: string,
): never {
  const failure = createRuntimeBudgetExceededFailure({
    toolName,
    budgetSurface,
    measuredValue: createToolGuardrailMetricValue(measuredValue, unit),
    limitValue: createToolGuardrailMetricValue(limitValue, unit),
  });

  const guidanceSuffix = narrowingGuidance === undefined ? "" : ` ${narrowingGuidance}`;

  throw new TraversalRuntimeBudgetExceededError(
    `${formatToolGuardrailFailureAsText(failure)} This traversal runtime budget acts as a deeper emergency safeguard after server-side preflight admission.${guidanceSuffix}`,
    toolName,
    budgetSurface,
    measuredValue,
    limitValue,
    unit,
  );
}

/**
 * Creates a fresh traversal runtime budget state for one guarded traversal operation.
 *
 * @param startedAtMs - Optional override for the traversal start timestamp.
 * @returns Mutable counters that later checkpoints can update and validate.
 *
 * @remarks
 * Callers should create one state per traversal request so visited-entry, visited-directory, and
 * elapsed-runtime checks stay scoped to the exact operation that may need deterministic refusal.
 */
export function createTraversalRuntimeBudgetState(
  startedAtMs: number = Date.now(),
): TraversalRuntimeBudgetState {
  return {
    startedAtMs,
    visitedEntries: 0,
    visitedDirectories: 0,
  };
}

/**
 * Increments the visited-entry counter for a guarded traversal.
 *
 * @param state - Runtime budget state that owns the traversal counters.
 * @param increment - Number of additional entries that were just visited.
 * @returns Nothing. The state is updated in place.
 */
export function recordTraversalEntryVisit(
  state: TraversalRuntimeBudgetState,
  increment: number = 1,
): void {
  state.visitedEntries += increment;
}

/**
 * Increments the visited-directory counter for a guarded traversal.
 *
 * @param state - Runtime budget state that owns the traversal counters.
 * @param increment - Number of additional directories that were just visited.
 * @returns Nothing. The state is updated in place.
 */
export function recordTraversalDirectoryVisit(
  state: TraversalRuntimeBudgetState,
  increment: number = 1,
): void {
  state.visitedDirectories += increment;
}

/**
 * Calculates the elapsed wall-clock runtime for one guarded traversal.
 *
 * @param state - Runtime budget state that owns the traversal start timestamp.
 * @param nowMs - Optional timestamp override used by deterministic callers or tests.
 * @returns The elapsed milliseconds since the traversal began.
 */
export function getTraversalRuntimeElapsedMs(
  state: TraversalRuntimeBudgetState,
  nowMs: number = Date.now(),
): number {
  return nowMs - state.startedAtMs;
}

/**
 * Enforces canonical traversal entry, directory, and soft time budgets for one guarded traversal.
 *
 * @param toolName - Exact MCP tool name that owns the traversal and any resulting refusal.
 * @param state - Runtime budget state that tracks traversal counters.
 * @param nowMs - Optional timestamp override used by deterministic callers or tests.
 * @returns Nothing when all traversal budgets remain within the canonical ceilings.
 *
 * @remarks
 * Budget failures are intentional DX and runtime-stability guardrails. They convert runaway broad
 * traversal into a structured refusal before the server spends too much time or noise on one request.
 */
export function assertTraversalRuntimeBudget(
  toolName: string,
  state: TraversalRuntimeBudgetState,
  nowMs: number = Date.now(),
  narrowingGuidance?: string,
  limits: TraversalRuntimeBudgetLimits = DEFAULT_TRAVERSAL_RUNTIME_BUDGET_LIMITS,
): void {
  if (state.visitedEntries > limits.maxVisitedEntries) {
    throwTraversalRuntimeBudgetExceededFailure(
      toolName,
      "traversal entries visited",
      state.visitedEntries,
      limits.maxVisitedEntries,
      "entries",
      narrowingGuidance,
    );
  }

  if (state.visitedDirectories > limits.maxVisitedDirectories) {
    throwTraversalRuntimeBudgetExceededFailure(
      toolName,
      "traversal directories visited",
      state.visitedDirectories,
      limits.maxVisitedDirectories,
      "directories",
      narrowingGuidance,
    );
  }

  const elapsedMs = getTraversalRuntimeElapsedMs(state, nowMs);

  if (elapsedMs > limits.softTimeBudgetMs) {
    throwTraversalRuntimeBudgetExceededFailure(
      toolName,
      "traversal soft runtime budget",
      elapsedMs,
      limits.softTimeBudgetMs,
      "milliseconds",
      narrowingGuidance,
    );
  }
}
