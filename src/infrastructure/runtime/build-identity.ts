import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_MANIFEST_FILE_NAME = "package.json";
const PACKAGE_MANIFEST_NAME = "mcp-filesystem-extended";
const MAX_MANIFEST_ASCENT_LEVELS = 6;

/**
 * Resolved build identity of the running server process.
 *
 * @remarks
 * The identity makes stale-process and stale-build anomalies observable at startup: the package
 * version comes from the workspace manifest, the bundle hash is computed from the running module
 * file, and the runtime and process identifiers anchor the executing process.
 */
export interface BuildIdentity {
  /**
   * Package version read from the workspace manifest.
   */
  packageVersion: string;

  /**
   * SHA-256 hex digest of the running module file (the emitted bundle in deployed layouts).
   */
  bundleSha256: string;

  /**
   * Node.js runtime version of the executing process.
   */
  nodeVersion: string;

  /**
   * Operating-system process identifier of the executing process.
   */
  processId: number;
}

/**
 * Reads and validates the identity fields of one candidate package manifest.
 *
 * @param manifestPath - Candidate manifest path to read.
 * @returns The parsed name and version, or null when the manifest is unreadable or malformed.
 */
function readManifestIdentity(manifestPath: string): { name: string; version: string } | null {
  let parsedManifest: unknown;

  try {
    parsedManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }

  if (typeof parsedManifest !== "object" || parsedManifest === null) {
    return null;
  }

  if (!("name" in parsedManifest) || !("version" in parsedManifest)) {
    return null;
  }

  const { name, version } = parsedManifest;

  if (typeof name !== "string" || typeof version !== "string") {
    return null;
  }

  return { name, version };
}

/**
 * Resolves the workspace package version by ascending from a start directory to the manifest that
 * belongs to this package.
 *
 * @param startDirectory - Directory from which the manifest ascent begins.
 * @returns The package version declared by the workspace manifest.
 */
function resolvePackageVersion(startDirectory: string): string {
  let currentDirectory = startDirectory;

  for (let ascentLevel = 0; ascentLevel < MAX_MANIFEST_ASCENT_LEVELS; ascentLevel += 1) {
    const manifestIdentity = readManifestIdentity(
      path.join(currentDirectory, PACKAGE_MANIFEST_FILE_NAME),
    );

    if (manifestIdentity !== null && manifestIdentity.name === PACKAGE_MANIFEST_NAME) {
      return manifestIdentity.version;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      break;
    }

    currentDirectory = parentDirectory;
  }

  throw new Error(
    `Unable to resolve the ${PACKAGE_MANIFEST_NAME} package manifest from '${startDirectory}'.`,
  );
}

/**
 * Resolves the build identity of the running server process.
 *
 * @remarks
 * The bundle hash is computed from the running module file, so a deployed bundle and a source-tree
 * execution each report their own truthful file identity.
 *
 * @param options - Optional white-box seam: an explicit start directory for the manifest ascent.
 * @returns The resolved build identity of the running process.
 */
export function resolveBuildIdentity(options?: { readonly startDirectory?: string }): BuildIdentity {
  const moduleFilePath = fileURLToPath(import.meta.url);
  const packageVersion = resolvePackageVersion(options?.startDirectory ?? path.dirname(moduleFilePath));
  const bundleSha256 = createHash("sha256").update(readFileSync(moduleFilePath)).digest("hex");

  return {
    packageVersion,
    bundleSha256,
    nodeVersion: process.version,
    processId: process.pid,
  };
}
