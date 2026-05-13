import fs from "fs/promises";
import path from "path";
import ignore from "ignore";

/**
 * Canonical root-local source label for optional traversal enrichment from `.gitignore`.
 *
 * @remarks
 * `.gitignore` remains a secondary additive surface layered on top of the server-owned default
 * traversal policy, but the active enrichment model is directory-scoped and hierarchical rather
 * than root-only.
 */
export const ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH = ".gitignore";

/**
 * Parsed secondary traversal-enrichment surface derived from one concrete `.gitignore` file.
 */
export interface GitIgnoreTraversalEnrichment {
  /**
   * Traversal-root-relative source-path label that identifies the parsed `.gitignore` source.
   */
  readonly sourcePath: string;

  /**
   * Parsed matcher that downstream traversal endpoints can apply to pathnames relative to the
   * directory that owns this `.gitignore` file.
   */
  readonly matcher: ReturnType<typeof ignore>;
}

/**
 * Optional overrides for `.gitignore` traversal-enrichment creation.
 *
 * @remarks
 * These overrides customize downstream diagnostics only and do not change the secondary role of
 * `.gitignore` inside the broader traversal hardening model.
 */
export interface CreateGitIgnoreTraversalEnrichmentOptions {
  /**
   * Source-path label surfaced to downstream consumers for diagnostics and policy reporting.
   */
  readonly sourcePath?: string;
}

/**
 * Runtime hierarchy state for directory-scoped `.gitignore` traversal enrichment.
 *
 * @remarks
 * The hierarchy is rooted at the validated traversal root and lazily caches parsed `.gitignore`
 * files for directories encountered during traversal. This lets nested package- or app-local
 * `.gitignore` files participate only for their own subtree.
 */
export interface GitIgnoreTraversalHierarchy {
  /**
   * Absolute validated traversal root that anchors the hierarchy.
   */
  readonly rootAbsolutePath: string;

  /**
   * Lazy cache keyed by traversal-root-relative directory path.
   */
  readonly layerCache: Map<string, GitIgnoreTraversalEnrichment | null>;
}

function normalizeTraversalRelativePath(pathValue: string): string {
  if (pathValue.length === 0) {
    return ".";
  }

  const slashNormalizedPath = pathValue.replaceAll("\\", "/").replace(/\/+/gu, "/");
  const trimmedLeadingDotPath = slashNormalizedPath.startsWith("./")
    ? slashNormalizedPath.slice(2)
    : slashNormalizedPath;
  const trimmedTrailingSlashPath = trimmedLeadingDotPath.endsWith("/")
    && trimmedLeadingDotPath.length > 1
    ? trimmedLeadingDotPath.slice(0, -1)
    : trimmedLeadingDotPath;

  return trimmedTrailingSlashPath === "" || trimmedTrailingSlashPath === "."
    ? "."
    : trimmedTrailingSlashPath;
}

function hasMaterialGitIgnoreRules(sourceText: string): boolean {
  return sourceText.split(/\r?\n/u).some((line) => {
    const trimmedLine = line.trim();

    return trimmedLine.length > 0 && !trimmedLine.startsWith("#");
  });
}

function resolveGitIgnoreSourcePath(directoryRelativePath: string): string {
  return directoryRelativePath === "."
    ? ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH
    : path.posix.join(directoryRelativePath, ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH);
}

function resolveGitIgnoreDirectoryAbsolutePath(
  hierarchy: GitIgnoreTraversalHierarchy,
  directoryRelativePath: string,
): string {
  return directoryRelativePath === "."
    ? hierarchy.rootAbsolutePath
    : path.join(hierarchy.rootAbsolutePath, directoryRelativePath);
}

function resolveContainingDirectoryRelativePath(
  candidateRelativePath: string,
): string {
  const normalizedCandidateRelativePath = normalizeTraversalRelativePath(candidateRelativePath);

  if (normalizedCandidateRelativePath === "." || !normalizedCandidateRelativePath.includes("/")) {
    return ".";
  }

  return normalizeTraversalRelativePath(
    path.posix.dirname(normalizedCandidateRelativePath),
  );
}

function buildGitIgnoreAncestorDirectoryRelativePaths(
  directoryRelativePath: string,
): readonly string[] {
  if (directoryRelativePath === ".") {
    return ["."];
  }

  const segments = directoryRelativePath.split("/").filter((segment) => segment.length > 0);
  const ancestorPaths = ["."];
  let currentPath = "";

  for (const segment of segments) {
    currentPath = currentPath === "" ? segment : `${currentPath}/${segment}`;
    ancestorPaths.push(currentPath);
  }

  return ancestorPaths;
}

function resolvePathRelativeToGitIgnoreDirectory(
  candidateRelativePath: string,
  directoryRelativePath: string,
): string {
  const normalizedCandidateRelativePath = normalizeTraversalRelativePath(candidateRelativePath);

  if (directoryRelativePath === ".") {
    return normalizedCandidateRelativePath;
  }

  return normalizeTraversalRelativePath(
    path.posix.relative(directoryRelativePath, normalizedCandidateRelativePath),
  );
}

/**
 * Creates the optional secondary traversal-enrichment surface from `.gitignore` text.
 *
 * @param sourceText - Raw `.gitignore` text supplied after filesystem access is already authorized.
 * @param options - Optional source-path label overrides for downstream diagnostics.
 * @returns Parsed traversal enrichment when material rules exist; otherwise `null`.
 *
 * @remarks
 * This helper is intentionally additive. It can narrow traversal further for one validated scope,
 * but it must not replace the canonical server-owned default exclusion policy.
 */
export function createGitIgnoreTraversalEnrichment(
  sourceText: string,
  options: CreateGitIgnoreTraversalEnrichmentOptions = {},
): GitIgnoreTraversalEnrichment | null {
  if (!hasMaterialGitIgnoreRules(sourceText)) {
    return null;
  }

  return {
    sourcePath: options.sourcePath ?? ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH,
    matcher: ignore().add(sourceText),
  };
}

/**
 * Creates the lazy runtime hierarchy for directory-scoped `.gitignore` traversal enrichment.
 *
 * @param rootAbsolutePath - Absolute validated traversal root that anchors the hierarchy.
 * @returns Lazy hierarchy state rooted at the validated traversal root.
 */
export function createGitIgnoreTraversalHierarchy(
  rootAbsolutePath: string,
): GitIgnoreTraversalHierarchy {
  return {
    rootAbsolutePath,
    layerCache: new Map<string, GitIgnoreTraversalEnrichment | null>(),
  };
}

/**
 * Reads one concrete directory-local `.gitignore` file.
 *
 * @param directoryAbsolutePath - Absolute directory path whose local `.gitignore` should be read.
 * @param options - Optional source-path label overrides for downstream diagnostics.
 * @returns Parsed traversal enrichment when a material `.gitignore` exists; otherwise `null`.
 */
export async function readGitIgnoreTraversalEnrichmentForDirectory(
  directoryAbsolutePath: string,
  options: CreateGitIgnoreTraversalEnrichmentOptions = {},
): Promise<GitIgnoreTraversalEnrichment | null> {
  const gitIgnorePath = path.join(
    directoryAbsolutePath,
    ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH,
  );
  const sourceText = await fs.readFile(gitIgnorePath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (sourceText === null) {
    return null;
  }

  return createGitIgnoreTraversalEnrichment(sourceText, options);
}

/**
 * Reads the optional traversal-root `.gitignore` and converts it into the shared secondary
 * enrichment surface.
 *
 * @param rootPath - Validated traversal root whose local `.gitignore` should be read.
 * @param options - Optional source-path label overrides for downstream diagnostics.
 * @returns Parsed traversal enrichment when a material traversal-root `.gitignore` exists; otherwise `null`.
 */
export async function readGitIgnoreTraversalEnrichmentForRoot(
  rootPath: string,
  options: CreateGitIgnoreTraversalEnrichmentOptions = {},
): Promise<GitIgnoreTraversalEnrichment | null> {
  return readGitIgnoreTraversalEnrichmentForDirectory(rootPath, options);
}

/**
 * Resolves one cached directory-scoped `.gitignore` layer for the active traversal hierarchy.
 *
 * @param hierarchy - Lazy hierarchy anchored at the validated traversal root.
 * @param directoryRelativePath - Traversal-root-relative directory whose `.gitignore` should be resolved.
 * @returns Cached or newly parsed traversal-enrichment layer for that directory, or `null` when no material `.gitignore` exists there.
 */
export async function getGitIgnoreTraversalEnrichmentForDirectory(
  hierarchy: GitIgnoreTraversalHierarchy,
  directoryRelativePath: string,
): Promise<GitIgnoreTraversalEnrichment | null> {
  const normalizedDirectoryRelativePath = normalizeTraversalRelativePath(
    directoryRelativePath,
  );
  const cachedLayer = hierarchy.layerCache.get(normalizedDirectoryRelativePath);

  if (cachedLayer !== undefined || hierarchy.layerCache.has(normalizedDirectoryRelativePath)) {
    return cachedLayer ?? null;
  }

  const sourcePath = resolveGitIgnoreSourcePath(normalizedDirectoryRelativePath);
  const absoluteDirectoryPath = resolveGitIgnoreDirectoryAbsolutePath(
    hierarchy,
    normalizedDirectoryRelativePath,
  );
  const layer = await readGitIgnoreTraversalEnrichmentForDirectory(
    absoluteDirectoryPath,
    {
      sourcePath,
    },
  );

  hierarchy.layerCache.set(normalizedDirectoryRelativePath, layer);

  return layer;
}

/**
 * Determines whether one traversal-root-relative path is excluded by the active hierarchical
 * directory-scoped `.gitignore` layers.
 *
 * @param candidateRelativePath - Traversal-root-relative path being evaluated.
 * @param isDirectory - Whether the candidate path currently represents a directory entry.
 * @param hierarchy - Lazy hierarchy anchored at the validated traversal root.
 * @returns `true` when the active `.gitignore` layer stack excludes the candidate path.
 */
export async function isGitIgnoreTraversalHierarchyExcluded(
  candidateRelativePath: string,
  isDirectory: boolean,
  hierarchy: GitIgnoreTraversalHierarchy,
): Promise<boolean> {
  const normalizedCandidateRelativePath = normalizeTraversalRelativePath(
    candidateRelativePath,
  );

  if (normalizedCandidateRelativePath === ".") {
    return false;
  }

  const containingDirectoryRelativePath = isDirectory
    ? resolveContainingDirectoryRelativePath(normalizedCandidateRelativePath)
    : resolveContainingDirectoryRelativePath(normalizedCandidateRelativePath);
  const ancestorDirectoryRelativePaths = buildGitIgnoreAncestorDirectoryRelativePaths(
    containingDirectoryRelativePath,
  );
  let excluded = false;

  for (const ancestorDirectoryRelativePath of ancestorDirectoryRelativePaths) {
    const enrichment = await getGitIgnoreTraversalEnrichmentForDirectory(
      hierarchy,
      ancestorDirectoryRelativePath,
    );

    if (enrichment === null) {
      continue;
    }

    const pathRelativeToLayer = resolvePathRelativeToGitIgnoreDirectory(
      normalizedCandidateRelativePath,
      ancestorDirectoryRelativePath,
    );
    const testResult = enrichment.matcher.test(pathRelativeToLayer);

    if (testResult.ignored) {
      excluded = true;
      continue;
    }

    if (testResult.unignored) {
      excluded = false;
    }
  }

  return excluded;
}
