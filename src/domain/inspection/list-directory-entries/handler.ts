import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { encode } from "@toon-format/toon";
import { minimatch } from "minimatch";
import {
  getFileSystemEntryMetadata,
  type FileSystemEntryMetadata,
  type FileSystemEntryType,
} from "@infrastructure/filesystem/filesystem-entry-metadata";
import { validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Structured directory entry returned by the `list_directory_entries` tool.
 */
export interface ListedDirectoryEntry {
  /**
   * Leaf entry name.
   */
  name: string;

  /**
   * Entry path relative to the requested root path.
   */
  path: string;

  /**
   * Required entry category.
   */
  type: FileSystemEntryType;

  /**
   * Nested child entries when recursive traversal is enabled.
   */
  children?: ListedDirectoryEntry[];

  /**
   * Entry size in bytes when metadata inclusion is enabled.
   */
  size?: number;

  /**
   * Entry creation timestamp when metadata inclusion is enabled.
   */
  created?: string;

  /**
   * Entry last-modified timestamp when metadata inclusion is enabled.
   */
  modified?: string;

  /**
   * Entry last-accessed timestamp when metadata inclusion is enabled.
   */
  accessed?: string;

  /**
   * Entry permission bits when metadata inclusion is enabled.
   */
  permissions?: string;
}

/**
 * Structured listing root returned for one requested directory path.
 */
export interface ListedDirectoryRoot {
  /**
   * Directory path exactly as requested by the caller.
   */
  requestedPath: string;

  /**
   * Structured entries rooted beneath the requested path.
   */
  entries: ListedDirectoryEntry[];
}

/**
 * TOON-encoded response payload for the consolidated directory listing tool.
 */
export interface ListDirectoryEntriesResult {
  /**
   * Listing roots in request order.
   */
  roots: ListedDirectoryRoot[];
}

function resolveEntryType(entry: Dirent): FileSystemEntryType {
  if (entry.isDirectory()) {
    return "directory";
  }

  if (entry.isFile()) {
    return "file";
  }

  return "other";
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function shouldExcludePath(relativePath: string, excludePatterns: string[]): boolean {
  if (relativePath === "") {
    return false;
  }

  return excludePatterns.some((pattern) => {
    let globPattern = pattern;

    if (!pattern.includes("*") && !pattern.includes("?")) {
      if (pattern.includes("/")) {
        globPattern = `**/${pattern}/**`;
      } else {
        globPattern = `**/*${pattern}*/**`;
      }
    }

    return minimatch(relativePath, globPattern, {
      dot: true,
      nocase: true,
      matchBase: true,
    });
  });
}

function applyOptionalMetadata(
  entry: ListedDirectoryEntry,
  metadata: FileSystemEntryMetadata
): ListedDirectoryEntry {
  return {
    ...entry,
    size: metadata.size,
    created: metadata.created,
    modified: metadata.modified,
    accessed: metadata.accessed,
    permissions: metadata.permissions,
  };
}

async function collectDirectoryEntries(
  currentPath: string,
  currentRelativePath: string,
  recursive: boolean,
  includeMetadata: boolean,
  excludePatterns: string[]
): Promise<ListedDirectoryEntry[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const listedEntries: ListedDirectoryEntry[] = [];

  for (const entry of entries) {
    const entryAbsolutePath = path.join(currentPath, entry.name);
    const rawRelativePath =
      currentRelativePath === ""
        ? entry.name
        : path.join(currentRelativePath, entry.name);
    const relativePath = normalizeRelativePath(rawRelativePath);

    if (shouldExcludePath(relativePath, excludePatterns)) {
      continue;
    }

    let listedEntry: ListedDirectoryEntry = {
      name: entry.name,
      path: relativePath,
      type: resolveEntryType(entry),
    };

    if (includeMetadata) {
      const metadata = await getFileSystemEntryMetadata(entryAbsolutePath);
      listedEntry = applyOptionalMetadata(listedEntry, metadata);
    }

    if (recursive && entry.isDirectory()) {
      listedEntry.children = await collectDirectoryEntries(
        entryAbsolutePath,
        rawRelativePath,
        recursive,
        includeMetadata,
        excludePatterns
      );
    }

    listedEntries.push(listedEntry);
  }

  return listedEntries;
}

async function buildListedDirectoryRoot(
  requestedPath: string,
  recursive: boolean,
  includeMetadata: boolean,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<ListedDirectoryRoot> {
  const validPath = await validatePath(requestedPath, allowedDirectories);

  return {
    requestedPath,
    entries: await collectDirectoryEntries(
      validPath,
      "",
      recursive,
      includeMetadata,
      excludePatterns
    ),
  };
}

/**
 * Builds the structured directory listing result used by the directory-entry surface.
 *
 * @param requestedPaths - Directory paths to list.
 * @param recursive - Whether nested directory content should be traversed.
 * @param includeMetadata - Whether optional metadata fields should be added.
 * @param excludePatterns - Optional glob-like exclude patterns.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns Structured directory listing result.
 */
export async function getListDirectoryEntriesResult(
  requestedPaths: string[],
  recursive: boolean,
  includeMetadata: boolean,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<ListDirectoryEntriesResult> {
  const roots = await Promise.all(
    requestedPaths.map((requestedPath) =>
      buildListedDirectoryRoot(
        requestedPath,
        recursive,
        includeMetadata,
        excludePatterns,
        allowedDirectories
      )
    )
  );

  const result: ListDirectoryEntriesResult = {
    roots,
  };

  return result;
}

/**
 * Lists directory entries as a TOON-encoded structured payload.
 *
 * @param requestedPaths - Directory paths to list.
 * @param recursive - Whether nested directory content should be traversed.
 * @param includeMetadata - Whether optional metadata fields should be added.
 * @param excludePatterns - Optional glob-like exclude patterns.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns TOON-encoded structured directory listing output.
 */
export async function handleListDirectoryEntries(
  requestedPaths: string[],
  recursive: boolean,
  includeMetadata: boolean,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const result = await getListDirectoryEntriesResult(
    requestedPaths,
    recursive,
    includeMetadata,
    excludePatterns,
    allowedDirectories
  );

  return encode(result);
}
