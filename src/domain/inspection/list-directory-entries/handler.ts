import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { encode } from "@toon-format/toon";
import { DISCOVERY_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import { minimatch } from "minimatch";
import {
  DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  type FileSystemEntryMetadata,
  type FileSystemEntryMetadataSelection,
} from "@domain/inspection/shared/filesystem-entry-metadata-contract";
import { getFileSystemEntryMetadata } from "@infrastructure/filesystem/filesystem-entry-metadata";
import { validatePath } from "@infrastructure/filesystem/path-guard";

/**
 * Structured directory entry returned by the `list_directory_entries` tool.
 */
export interface ListedDirectoryEntry extends FileSystemEntryMetadata {
  /**
   * Leaf entry name.
   */
  name: string;

  /**
   * Entry path relative to the requested root path.
   */
  path: string;

  /**
   * Nested child entries when recursive traversal is enabled.
   */
  children?: ListedDirectoryEntry[];
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

async function collectDirectoryEntries(
  currentPath: string,
  currentRelativePath: string,
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection,
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

    const metadata = await getFileSystemEntryMetadata(
      entryAbsolutePath,
      metadataSelection
    );

    let listedEntry: ListedDirectoryEntry = {
      name: entry.name,
      path: relativePath,
      ...metadata,
    };

    if (recursive && entry.isDirectory()) {
      listedEntry.children = await collectDirectoryEntries(
        entryAbsolutePath,
        rawRelativePath,
        recursive,
        metadataSelection,
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
  metadataSelection: FileSystemEntryMetadataSelection,
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
      metadataSelection,
      excludePatterns
    ),
  };
}

/**
 * Builds the structured directory listing result used by the directory-entry surface.
 *
 * @remarks
 * This surface reuses the grouped metadata contract defined in
 * `@domain/inspection/shared/filesystem-entry-metadata-contract` so
 * `get_path_metadata` and `list_directory_entries` stay aligned on the same
 * metadata selection behavior.
 *
 * @param requestedPaths - Directory paths to list.
 * @param recursive - Whether nested directory content should be traversed.
 * @param metadataSelection - Grouped optional metadata flags. `size` and `type` remain required defaults.
 * @param excludePatterns - Optional glob-like exclude patterns.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns Structured directory listing result.
 */
export async function getListDirectoryEntriesResult(
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<ListDirectoryEntriesResult> {
  const roots = await Promise.all(
    requestedPaths.map((requestedPath) =>
      buildListedDirectoryRoot(
        requestedPath,
        recursive,
        metadataSelection,
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
 * @param metadataSelection - Grouped optional metadata flags. `size` and `type` remain required defaults.
 * @param excludePatterns - Optional glob-like exclude patterns.
 * @param allowedDirectories - Allowed directory roots used during path validation.
 * @returns TOON-encoded structured directory listing output.
 */
export async function handleListDirectoryEntries(
  requestedPaths: string[],
  recursive: boolean,
  metadataSelection: FileSystemEntryMetadataSelection = DEFAULT_FILE_SYSTEM_ENTRY_METADATA_SELECTION,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const result = await getListDirectoryEntriesResult(
    requestedPaths,
    recursive,
    metadataSelection,
    excludePatterns,
    allowedDirectories
  );

  const output = encode(result);

  assertActualTextBudget(
    "list_directory_entries",
    output.length,
    DISCOVERY_RESPONSE_CAP_CHARS,
    "encoded structured directory listing output",
  );

  return output;
}
