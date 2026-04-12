import { minimatch } from "minimatch";
import type { GitIgnoreTraversalEnrichment } from "./gitignore-traversal-enrichment";

/**
 * Canonical traversal-scope policy helpers shared by traversal-based inspection endpoints.
 *
 * @remarks
 * This module centralizes server-owned default exclusion classes for broad-root traversal while
 * preserving explicit access to roots inside excluded trees. Low-level path authorization remains
 * outside this module and stays owned by `validatePath()`.
 */

/**
 * Canonical server-owned directory classes excluded from broad-root traversal by default.
 *
 * @remarks
 * These classes define the default hardening baseline for broad-root traversal. Explicit roots
 * inside these trees still remain valid because the policy distinguishes broad recursive traversal
 * from deliberate caller targeting.
 */
export const DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES = [
  "node_modules",
  ".pnpm",
  ".git",
  ".venv",
  "venv",
  "__pypackages__",
  "dist",
  "build",
  "coverage",
] as const satisfies readonly string[];

/**
 * Canonical directory-class literal union for the traversal-scope policy.
 */
export type DefaultTraversalScopeExcludedDirectoryClass =
  (typeof DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES)[number];

const DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASS_SET = new Set<string>(
  DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES,
);

const TRAVERSAL_SCOPE_PATTERN_MATCH_OPTIONS = {
  dot: true,
  nocase: true,
  matchBase: true,
} as const;

const TRAVERSAL_SCOPE_PARTIAL_PATTERN_MATCH_OPTIONS = {
  ...TRAVERSAL_SCOPE_PATTERN_MATCH_OPTIONS,
  partial: true,
} as const;

function normalizeTraversalScopePattern(pattern: string): string {
  return pattern.replaceAll("\\", "/");
}

function createTraversalScopeExcludeMatcherPattern(pattern: string): string {
  const normalizedPattern = normalizeTraversalScopePattern(pattern);

  if (normalizedPattern.length === 0) {
    return normalizedPattern;
  }

  if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
    return normalizedPattern;
  }

  if (normalizedPattern.includes("/")) {
    return `**/${normalizedPattern}/**`;
  }

  return `**/*${normalizedPattern}*/**`;
}

function createTraversalScopeIncludeMatcherPatterns(pattern: string): readonly string[] {
  const normalizedPattern = normalizeTraversalScopePattern(pattern);

  if (normalizedPattern.length === 0) {
    return [];
  }

  if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
    return [normalizedPattern];
  }

  return [`**/${normalizedPattern}`, `**/${normalizedPattern}/**`];
}

function matchesTraversalScopeExcludePattern(pathValue: string, pattern: string): boolean {
  return minimatch(
    normalizeTraversalScopePath(pathValue),
    createTraversalScopeExcludeMatcherPattern(pattern),
    TRAVERSAL_SCOPE_PATTERN_MATCH_OPTIONS,
  );
}

function shouldReincludeTraversalScopePath(
  pathValue: string,
  includePatterns: readonly string[],
): boolean {
  const normalizedPath = normalizeTraversalScopePath(pathValue);

  return includePatterns.some((pattern) =>
    createTraversalScopeIncludeMatcherPatterns(pattern).some((matcherPattern) =>
      minimatch(
        normalizedPath,
        matcherPattern,
        TRAVERSAL_SCOPE_PATTERN_MATCH_OPTIONS,
      ),
    ),
  );
}

function canTraversalScopePathContainReincludedDescendant(
  pathValue: string,
  includePatterns: readonly string[],
): boolean {
  const normalizedPath = normalizeTraversalScopePath(pathValue);

  if (normalizedPath === ".") {
    return false;
  }

  return includePatterns.some((pattern) =>
    createTraversalScopeIncludeMatcherPatterns(pattern).some((matcherPattern) =>
      minimatch(
        normalizedPath,
        matcherPattern,
        TRAVERSAL_SCOPE_PARTIAL_PATTERN_MATCH_OPTIONS,
      ),
    ),
  );
}

function getTraversalScopePathSegments(pathValue: string): string[] {
  const normalizedPath = normalizeTraversalScopePath(pathValue);

  if (normalizedPath === ".") {
    return [];
  }

  return normalizedPath.split("/").filter((segment) => segment.length > 0 && segment !== ".");
}

/**
 * Canonical traversal-scope resolution result shared by downstream endpoint-adoption steps.
 */
export interface TraversalScopePolicyResolution {
  /**
   * Caller-supplied root path before traversal-policy normalization.
   */
  requestedRoot: string;

  /**
   * Slash-normalized root path used by traversal-policy matching.
   */
  normalizedRoot: string;

  /**
   * Indicates whether the requested root explicitly targets a path beneath a default-excluded class.
   */
  explicitExcludedRoot: boolean;

  /**
   * Indicates whether server-owned default excluded classes must participate in this traversal.
   */
  applyDefaultExcludedClasses: boolean;

  /**
   * Canonical default-excluded directory classes visible to downstream consumers.
   */
  defaultExcludedDirectoryClasses: readonly DefaultTraversalScopeExcludedDirectoryClass[];

  /**
   * Caller-supplied exclude globs normalized into the shared traversal policy contract.
   */
  callerExcludeGlobs: readonly string[];

  /**
   * Indicates whether optional root-local `.gitignore` enrichment participates in this traversal.
   */
  gitIgnoreEnrichmentApplied: boolean;

  /**
   * Optional parsed `.gitignore` enrichment surface carried forward for downstream traversal consumers.
   */
  gitIgnoreTraversalEnrichment: GitIgnoreTraversalEnrichment | null;

  /**
   * Indicates whether the caller explicitly enabled secondary `.gitignore` participation.
   */
  respectGitIgnore: boolean;

  /**
   * Additive caller-supplied descendant re-include globs normalized into the shared policy contract.
   */
  effectiveIncludeExcludedGlobs: readonly string[];

  /**
   * Effective exclude globs for the current traversal context after explicit-root resolution.
   */
  effectiveExcludeGlobs: readonly string[];
}

/**
 * Optional additive controls that extend the shared traversal-scope policy without changing its
 * server-owned default exclusion baseline.
 *
 * @remarks
 * These options can reopen named descendants or layer root-local `.gitignore` behavior on top of
 * the server baseline, but they must not replace the canonical default exclusion model.
 */
export interface TraversalScopePolicyOptions {
  /**
   * Caller-supplied descendant re-include globs that reopen explicitly named excluded subtrees.
   */
  readonly includeExcludedGlobs?: readonly string[];

  /**
   * Parsed optional root-local `.gitignore` enrichment surface.
   */
  readonly gitIgnoreTraversalEnrichment?: GitIgnoreTraversalEnrichment | null;

  /**
   * Indicates whether optional root-local `.gitignore` enrichment should participate in this traversal.
   */
  readonly respectGitIgnore?: boolean;
}

/**
 * Normalizes a caller-provided traversal path for shared policy matching.
 *
 * @param pathValue - Requested or relative path that must be normalized for traversal-policy evaluation.
 * @returns Slash-normalized path text with root-like inputs collapsed to `.`.
 */
export function normalizeTraversalScopePath(pathValue: string): string {
  if (pathValue.length === 0) {
    return ".";
  }

  const slashNormalizedPath = pathValue.replaceAll("\\", "/");
  const condensedSeparators = slashNormalizedPath.replace(/\/+/g, "/");
  let normalizedPath = condensedSeparators;

  while (normalizedPath.startsWith("./")) {
    normalizedPath = normalizedPath.slice(2);
  }

  while (normalizedPath.endsWith("/") && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  if (normalizedPath === "" || normalizedPath === ".") {
    return ".";
  }

  return normalizedPath;
}

/**
 * Determines whether one directory segment belongs to the canonical default exclusion registry.
 *
 * @param directoryName - Single directory segment to classify.
 * @returns `true` when the segment belongs to the server-owned default exclusion registry.
 */
export function isDefaultTraversalScopeExcludedDirectoryClass(
  directoryName: string,
): directoryName is DefaultTraversalScopeExcludedDirectoryClass {
  return DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASS_SET.has(directoryName);
}

/**
 * Determines whether a path contains at least one server-owned default-excluded directory class.
 *
 * @param pathValue - Requested or relative path that should be classified against the default registry.
 * @returns `true` when any normalized directory segment matches a default-excluded class.
 */
export function isPathInsideDefaultTraversalScopeExclusion(pathValue: string): boolean {
  return getTraversalScopePathSegments(pathValue).some((segment) =>
    isDefaultTraversalScopeExcludedDirectoryClass(segment),
  );
}

/**
 * Determines whether the caller explicitly targeted a root inside a default-excluded tree.
 *
 * @param requestedRoot - Caller-supplied root path before traversal begins.
 * @returns `true` when the requested root itself sits beneath a default-excluded directory class.
 */
export function isExplicitTraversalRootInsideDefaultExcludedClass(requestedRoot: string): boolean {
  const normalizedRoot = normalizeTraversalScopePath(requestedRoot);

  if (normalizedRoot === ".") {
    return false;
  }

  return isPathInsideDefaultTraversalScopeExclusion(normalizedRoot);
}

/**
 * Expands the canonical default-excluded directory classes into reusable traversal exclude globs.
 *
 * @param excludedDirectoryClasses - Directory classes that should become reusable traversal globs.
 * @returns Glob patterns that match excluded directory roots together with their descendants.
 */
export function createDefaultTraversalScopeExcludeGlobs(
  excludedDirectoryClasses: readonly DefaultTraversalScopeExcludedDirectoryClass[] =
    DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES,
): string[] {
  return excludedDirectoryClasses.flatMap((directoryClass) => [
    `**/${directoryClass}`,
    `**/${directoryClass}/**`,
  ]);
}

/**
 * Determines whether one traversal-relative path should be excluded by the effective shared policy.
 *
 * @param pathValue - Traversal-relative path currently being evaluated.
 * @param resolution - Effective shared traversal policy for the active root.
 * @returns `true` when the path stays excluded after additive re-include processing.
 */
export function shouldExcludeTraversalScopePath(
  pathValue: string,
  resolution: TraversalScopePolicyResolution,
): boolean {
  const normalizedPath = normalizeTraversalScopePath(pathValue);

  if (normalizedPath === ".") {
    return false;
  }

  if (shouldReincludeTraversalScopePath(normalizedPath, resolution.effectiveIncludeExcludedGlobs)) {
    return false;
  }

  const excludedByEffectiveGlobs = resolution.effectiveExcludeGlobs.some((pattern) =>
    matchesTraversalScopeExcludePattern(normalizedPath, pattern),
  );
  const excludedByGitIgnore = resolution.gitIgnoreTraversalEnrichment?.matcher.ignores(
    normalizedPath,
  ) ?? false;

  return excludedByEffectiveGlobs || excludedByGitIgnore;
}

/**
 * Determines whether traversal should continue into one directory path even when the directory
 * itself is excluded by default, because additive re-include rules still target descendants beneath it.
 *
 * @param pathValue - Traversal-relative directory path currently being evaluated.
 * @param resolution - Effective shared traversal policy for the active root.
 * @returns `true` when traversal should continue into the directory.
 */
export function shouldTraverseTraversalScopeDirectoryPath(
  pathValue: string,
  resolution: TraversalScopePolicyResolution,
): boolean {
  if (!shouldExcludeTraversalScopePath(pathValue, resolution)) {
    return true;
  }

  return canTraversalScopePathContainReincludedDescendant(
    pathValue,
    resolution.effectiveIncludeExcludedGlobs,
  );
}

/**
 * Resolves the effective shared traversal policy for one caller-supplied root.
 *
 * @param requestedRoot - Caller-supplied root path that anchors the traversal.
 * @param callerExcludeGlobs - Caller-supplied exclude globs that remain additive to the shared policy.
 * @returns The normalized root, explicit-root classification, additive re-include state, optional
 * secondary `.gitignore` participation, and effective exclude globs for traversal.
 *
 * @remarks
 * The resolved policy preserves explicit access to excluded roots, keeps `.gitignore` enrichment
 * secondary, and carries the additive override surface forward so downstream traversal endpoints do
 * not need to invent their own exclusion rules.
 */
export function resolveTraversalScopePolicy(
  requestedRoot: string,
  callerExcludeGlobs: readonly string[] = [],
  options: TraversalScopePolicyOptions = {},
): TraversalScopePolicyResolution {
  const normalizedRoot = normalizeTraversalScopePath(requestedRoot);
  const explicitExcludedRoot = isExplicitTraversalRootInsideDefaultExcludedClass(normalizedRoot);
  const applyDefaultExcludedClasses = !explicitExcludedRoot;
  const respectGitIgnore = options.respectGitIgnore === true;
  const gitIgnoreTraversalEnrichment = respectGitIgnore
    ? options.gitIgnoreTraversalEnrichment ?? null
    : null;
  const gitIgnoreEnrichmentApplied = gitIgnoreTraversalEnrichment !== null;
  const effectiveIncludeExcludedGlobs = [...(options.includeExcludedGlobs ?? [])];
  const effectiveCallerExcludeGlobs = [...callerExcludeGlobs];
  const effectiveExcludeGlobs = applyDefaultExcludedClasses
    ? [...createDefaultTraversalScopeExcludeGlobs(), ...effectiveCallerExcludeGlobs]
    : [...effectiveCallerExcludeGlobs];

  return {
    requestedRoot,
    normalizedRoot,
    explicitExcludedRoot,
    applyDefaultExcludedClasses,
    defaultExcludedDirectoryClasses: DEFAULT_TRAVERSAL_SCOPE_EXCLUDED_DIRECTORY_CLASSES,
    callerExcludeGlobs: effectiveCallerExcludeGlobs,
    gitIgnoreEnrichmentApplied,
    gitIgnoreTraversalEnrichment,
    respectGitIgnore,
    effectiveIncludeExcludedGlobs,
    effectiveExcludeGlobs,
  };
}
