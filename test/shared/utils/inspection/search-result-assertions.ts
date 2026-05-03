import type { ResolvedInspectionSearchFixturePaths } from "./search-fixture-loader";

/**
 * Structured search match entry shared by fixed-string and regex search results.
 */
export interface InspectionSearchMatch {
  /**
   * Full line content returned by the structured search result.
   */
  readonly content: string;

  /**
   * Absolute file path associated with the search hit.
   */
  readonly file: string;

  /**
   * 1-based line number associated with the search hit.
   */
  readonly line: number;

  /**
   * Matched token or regex substring returned by the search lane.
   */
  readonly match: string;
}

/**
 * Minimal structured search result surface shared by fixed-string and regex unit tests.
 */
export interface InspectionSearchPathResult {
  /**
   * Error message returned by the search lane, or `null` on success.
   */
  readonly error: string | null;

  /**
   * Number of files searched for the current root.
   */
  readonly filesSearched: number;

  /**
   * Structured match entries returned for the current root.
   */
  readonly matches: readonly InspectionSearchMatch[];

  /**
   * Optional root label reported by multi-root structured responses.
   */
  readonly root?: string;

  /**
   * Total number of matches returned for the current root.
   */
  readonly totalMatches: number;

  /**
   * Whether the result surface was truncated by budget constraints.
   */
  readonly truncated: boolean;
}

/**
 * Expected single-match contract derived from the canonical explicit file-scope fixture.
 */
export interface ExpectedInspectionSearchMatchContract {
  /**
   * Header line that should be returned by the structured search result.
   */
  readonly expectedContent: string;

  /**
   * Absolute file path that should own the structured search match.
   */
  readonly expectedFile: string;

  /**
   * 1-based line number expected for the structured search match.
   */
  readonly expectedLine: number;

  /**
   * Exact token expected to be reported as the match.
   */
  readonly expectedMatch: string;
}

/**
 * Throws a descriptive error when the provided condition is false.
 *
 * @param condition - Assertion condition to evaluate.
 * @param message - Error message raised when the condition fails.
 */
function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Builds the canonical single-match expectation for the shared explicit file-scope fixture.
 *
 * @param fixturePaths - Resolved fixture paths for the canonical inspection-search sample.
 * @param headerLine - Header line read from the canonical CSV fixture.
 * @returns Expected structured single-match contract.
 */
export function createExplicitFileScopeHeaderMatchContract(
  fixturePaths: ResolvedInspectionSearchFixturePaths,
  headerLine: string,
): ExpectedInspectionSearchMatchContract {
  return {
    expectedContent: headerLine,
    expectedFile: fixturePaths.fileAbsolutePath,
    expectedLine: fixturePaths.fixture.canonicalMatchLine,
    expectedMatch: fixturePaths.fixture.canonicalSearchToken,
  };
}

/**
 * Converts an expected match contract into the structured match payload shape used by search results.
 *
 * @param contract - Canonical single-match expectation.
 * @returns Structured search match payload.
 */
export function createExpectedInspectionSearchMatch(
  contract: ExpectedInspectionSearchMatchContract,
): InspectionSearchMatch {
  return {
    content: contract.expectedContent,
    file: contract.expectedFile,
    line: contract.expectedLine,
    match: contract.expectedMatch,
  };
}

/**
 * Asserts that a structured search result resolved the canonical explicit file-scope fixture as one successful single match.
 *
 * @param result - Structured fixed-string or regex path result.
 * @param contract - Expected single-match contract derived from the shared fixture.
 */
export function assertExplicitFileScopeSingleMatchResult(
  result: InspectionSearchPathResult,
  contract: ExpectedInspectionSearchMatchContract,
): void {
  assertCondition(
    result.error === null,
    `Expected a successful structured search result but received error '${result.error ?? "unknown"}'.`,
  );
  assertCondition(
    result.filesSearched === 1,
    `Expected filesSearched to equal 1 but received ${result.filesSearched}.`,
  );
  assertCondition(
    result.totalMatches === 1,
    `Expected totalMatches to equal 1 but received ${result.totalMatches}.`,
  );
  assertCondition(
    result.truncated === false,
    "Expected the explicit file-scope result to remain untruncated.",
  );
  assertCondition(
    result.matches.length === 1,
    `Expected exactly one structured match but received ${result.matches.length}.`,
  );

  const [match] = result.matches;

  assertCondition(match !== undefined, "Expected one structured match entry.");
  assertCondition(
    match.content === contract.expectedContent,
    `Expected match content '${contract.expectedContent}' but received '${match.content}'.`,
  );
  assertCondition(
    match.file === contract.expectedFile,
    `Expected match file '${contract.expectedFile}' but received '${match.file}'.`,
  );
  assertCondition(
    match.line === contract.expectedLine,
    `Expected match line ${contract.expectedLine} but received ${match.line}.`,
  );
  assertCondition(
    match.match === contract.expectedMatch,
    `Expected match token '${contract.expectedMatch}' but received '${match.match}'.`,
  );
}

/**
 * Asserts that a directory-root search kept include-glob filtering active and therefore produced no matches.
 *
 * @param result - Structured fixed-string or regex path result for a directory-root search.
 */
export function assertDirectoryRootIncludeGlobFilteredResult(
  result: InspectionSearchPathResult,
): void {
  assertCondition(
    result.error === null,
    `Expected a successful directory-root result but received error '${result.error ?? "unknown"}'.`,
  );
  assertCondition(
    result.filesSearched === 0,
    `Expected filesSearched to equal 0 but received ${result.filesSearched}.`,
  );
  assertCondition(
    result.totalMatches === 0,
    `Expected totalMatches to equal 0 but received ${result.totalMatches}.`,
  );
  assertCondition(
    result.matches.length === 0,
    `Expected no structured matches but received ${result.matches.length}.`,
  );
  assertCondition(
    result.truncated === false,
    "Expected the directory-root include-glob result to remain untruncated.",
  );
}

/**
 * Asserts that a root-local failure is preserved without fabricated matches or searched-file counts.
 *
 * @param result - Structured root-local result surface.
 * @param expectedError - Exact root-local error message expected from the search lane.
 * @param expectedRoot - Optional root label that must remain attached to the failure surface.
 */
export function assertRootLocalSearchFailureResult(
  result: InspectionSearchPathResult,
  expectedError: string,
  expectedRoot?: string,
): void {
  assertCondition(
    result.error === expectedError,
    `Expected root-local error '${expectedError}' but received '${result.error ?? "null"}'.`,
  );
  assertCondition(
    result.filesSearched === 0,
    `Expected filesSearched to equal 0 but received ${result.filesSearched}.`,
  );
  assertCondition(
    result.totalMatches === 0,
    `Expected totalMatches to equal 0 but received ${result.totalMatches}.`,
  );
  assertCondition(
    result.matches.length === 0,
    `Expected no structured matches but received ${result.matches.length}.`,
  );
  assertCondition(
    result.truncated === false,
    "Expected the root-local failure surface to remain untruncated.",
  );

  if (expectedRoot !== undefined) {
    assertCondition(
      result.root === expectedRoot,
      `Expected root '${expectedRoot}' but received '${result.root ?? "undefined"}'.`,
    );
  }
}
