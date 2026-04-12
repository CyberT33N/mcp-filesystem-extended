import fs from "fs/promises";
import path from "path";
import ignore from "ignore";

/**
 * Canonical root-local source label for optional traversal enrichment from `.gitignore`.
 *
 * @remarks
 * The root-local `.gitignore` remains a secondary additive surface. The shared traversal policy
 * still owns the default exclusion baseline for broad-root traversal.
 */
export const ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH = ".gitignore";

/**
 * Parsed secondary traversal-enrichment surface derived from root-local `.gitignore` content.
 */
export interface GitIgnoreTraversalEnrichment {
  /**
   * Root-local path label that identifies the parsed `.gitignore` source.
   */
  readonly sourcePath: string;

  /**
   * Parsed matcher that downstream traversal endpoints can apply to repository-relative pathnames.
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

function hasMaterialGitIgnoreRules(sourceText: string): boolean {
  return sourceText.split(/\r?\n/u).some((line) => {
    const trimmedLine = line.trim();

    return trimmedLine.length > 0 && !trimmedLine.startsWith("#");
  });
}

/**
 * Creates the optional secondary traversal-enrichment surface from root-local `.gitignore` text.
 *
 * @param sourceText - Raw root-local `.gitignore` text supplied by the caller after filesystem access is already authorized.
 * @param options - Optional source-path label overrides for downstream diagnostics.
 * @returns Parsed traversal enrichment when material rules exist; otherwise `null`.
 *
 * @remarks
 * This helper is intentionally additive. It can narrow traversal further for one validated root,
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
 * Reads the optional root-local `.gitignore` for one validated traversal root and converts it into
 * the shared secondary enrichment surface.
 *
 * @param rootPath - Validated traversal root whose local `.gitignore` should be read.
 * @param options - Optional source-path label overrides for downstream diagnostics.
 * @returns Parsed traversal enrichment when a material root-local `.gitignore` exists; otherwise `null`.
 *
 * @remarks
 * Missing `.gitignore` files are treated as an ordinary absence of secondary enrichment rather than
 * as a policy failure. The validated traversal root and the server baseline remain authoritative.
 */
export async function readGitIgnoreTraversalEnrichmentForRoot(
  rootPath: string,
  options: CreateGitIgnoreTraversalEnrichmentOptions = {},
): Promise<GitIgnoreTraversalEnrichment | null> {
  const gitIgnorePath = path.join(rootPath, ROOT_LOCAL_GITIGNORE_TRAVERSAL_SOURCE_PATH);
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
