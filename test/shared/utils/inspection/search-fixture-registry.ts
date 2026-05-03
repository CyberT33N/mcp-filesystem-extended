/**
 * Stable registry key for the canonical explicit file-scope CSV inspection fixture.
 */
export const EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY = "explicit-file-scope-csv" as const;

/**
 * Supported inspection-search fixture keys exposed by the shared registry.
 */
export type InspectionSearchFixtureKey = typeof EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY;

/**
 * Describes one reusable inspection-search fixture entry consumed by shared loaders and assertions.
 */
export interface InspectionSearchFixtureDefinition {
  /**
   * Stable registry identifier for the fixture entry.
   */
  readonly key: InspectionSearchFixtureKey;

  /**
   * Workspace-relative directory path used for directory-root search contracts.
   */
  readonly rootRelativePath: string;

  /**
   * Workspace-relative file path used for explicit file-root search contracts.
   */
  readonly fileRelativePath: string;

  /**
   * Canonical token expected to match the fixture header line.
   */
  readonly canonicalSearchToken: string;

  /**
   * 1-based line number where the canonical search token should match.
   */
  readonly canonicalMatchLine: number;

  /**
   * Human-readable summary of what the fixture proves.
   */
  readonly description: string;
}

/**
 * Canonical registry of reusable inspection-search fixtures for shared unit-test helpers.
 */
export const INSPECTION_SEARCH_FIXTURE_REGISTRY = {
  [EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY]: {
    key: EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY,
    rootRelativePath: "test/fixtures/search-explicit-file-scope-contract",
    fileRelativePath:
      "test/fixtures/search-explicit-file-scope-contract/patient-explicit-file-scope.csv",
    canonicalSearchToken: "PRAXIS1",
    canonicalMatchLine: 1,
    description:
      "Validates that explicit file-root searches bypass include globs while directory-root searches keep include-glob filtering active.",
  },
} as const satisfies Readonly<
  Record<InspectionSearchFixtureKey, InspectionSearchFixtureDefinition>
>;

/**
 * Returns the canonical fixture definition for the requested registry key.
 *
 * @param fixtureKey - Stable registry key of the fixture definition to resolve.
 * @returns The canonical shared fixture definition.
 */
export function getInspectionSearchFixtureDefinition(
  fixtureKey: InspectionSearchFixtureKey,
): InspectionSearchFixtureDefinition {
  return INSPECTION_SEARCH_FIXTURE_REGISTRY[fixtureKey];
}

/**
 * Returns the currently supported inspection-search fixture keys in stable registry order.
 *
 * @returns Ordered inspection-search fixture keys.
 */
export function getInspectionSearchFixtureKeys(): readonly InspectionSearchFixtureKey[] {
  return [EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY];
}
