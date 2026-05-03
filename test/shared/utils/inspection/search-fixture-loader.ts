import {
  EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY,
  getInspectionSearchFixtureDefinition,
  type InspectionSearchFixtureDefinition,
  type InspectionSearchFixtureKey,
} from "./search-fixture-registry";

/**
 * Resolved absolute and relative paths for one shared inspection-search fixture.
 */
export interface ResolvedInspectionSearchFixturePaths {
  /**
   * Canonical registry definition backing the resolved fixture.
   */
  readonly fixture: InspectionSearchFixtureDefinition;

  /**
   * Workspace-relative directory path used for directory-root search contracts.
   */
  readonly rootRelativePath: string;

  /**
   * Workspace-relative file path used for explicit file-root search contracts.
   */
  readonly fileRelativePath: string;

  /**
   * Absolute directory path derived from the provided workspace root.
   */
  readonly rootAbsolutePath: string;

  /**
   * Absolute file path derived from the provided workspace root.
   */
  readonly fileAbsolutePath: string;
}

/**
 * Detects the dominant directory separator of the provided workspace root path.
 *
 * @param pathValue - Absolute workspace root path from the calling test surface.
 * @returns Backslash for Windows-style paths, otherwise forward slash.
 */
function getPathSeparator(pathValue: string): "/" | "\\" {
  return pathValue.includes("\\") ? "\\" : "/";
}

/**
 * Removes trailing path separators so relative path joins remain stable.
 *
 * @param pathValue - Absolute workspace root path from the calling test surface.
 * @returns Workspace root path without trailing separators.
 */
function trimTrailingSeparators(pathValue: string): string {
  return pathValue.replace(/[\\/]+$/u, "");
}

/**
 * Joins a workspace root with a workspace-relative path without relying on Node path helpers.
 *
 * @param workspaceRootPath - Absolute workspace root used by the calling test surface.
 * @param relativePath - Workspace-relative fixture path from the shared registry.
 * @returns Absolute path resolved against the provided workspace root.
 */
function joinWorkspaceRelativePath(
  workspaceRootPath: string,
  relativePath: string,
): string {
  const separator = getPathSeparator(workspaceRootPath);
  const normalizedRootPath = trimTrailingSeparators(workspaceRootPath);
  const normalizedRelativePath = relativePath
    .split("/")
    .filter((segment) => segment.length > 0)
    .join(separator);

  return normalizedRelativePath === ""
    ? normalizedRootPath
    : `${normalizedRootPath}${separator}${normalizedRelativePath}`;
}

/**
 * Resolves absolute and relative paths for the requested shared inspection fixture.
 *
 * @param workspaceRootPath - Absolute workspace root used by the calling test surface.
 * @param fixtureKey - Stable registry key of the shared inspection fixture to resolve.
 * @returns Absolute and relative paths for the requested fixture entry.
 */
export function resolveInspectionSearchFixturePaths(
  workspaceRootPath: string,
  fixtureKey: InspectionSearchFixtureKey,
): ResolvedInspectionSearchFixturePaths {
  const fixture = getInspectionSearchFixtureDefinition(fixtureKey);

  return {
    fixture,
    rootRelativePath: fixture.rootRelativePath,
    fileRelativePath: fixture.fileRelativePath,
    rootAbsolutePath: joinWorkspaceRelativePath(
      workspaceRootPath,
      fixture.rootRelativePath,
    ),
    fileAbsolutePath: joinWorkspaceRelativePath(
      workspaceRootPath,
      fixture.fileRelativePath,
    ),
  };
}

/**
 * Resolves absolute and relative paths for the canonical explicit file-scope CSV fixture.
 *
 * @param workspaceRootPath - Absolute workspace root used by the calling test surface.
 * @returns Absolute and relative paths for the canonical explicit file-scope fixture.
 */
export function resolveExplicitFileScopeCsvFixturePaths(
  workspaceRootPath: string,
): ResolvedInspectionSearchFixturePaths {
  return resolveInspectionSearchFixturePaths(
    workspaceRootPath,
    EXPLICIT_FILE_SCOPE_CSV_FIXTURE_KEY,
  );
}
