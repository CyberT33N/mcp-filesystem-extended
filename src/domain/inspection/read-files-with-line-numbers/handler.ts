import {
  assertExpectedFileTypes,
  collectValidatedFilesystemPreflightEntries,
} from "@domain/shared/guardrails/filesystem-preflight";
import { READ_FILES_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  assertActualTextBudget,
  assertProjectedTextBudget,
  estimateLineNumberedResponseCharsFromBytes,
} from "@domain/shared/guardrails/text-response-budget";
import {
  formatLineNumberedTextContent,
  readValidatedFullTextFile,
} from "@infrastructure/filesystem/text-read-core";

const READ_FILES_TOOL_NAME = "read_files_with_line_numbers";
const PROJECTED_READ_RECOMMENDED_ACTION =
  "Reduce the number of files, target smaller files, or split the read into narrower batches.";

/**
 * Reads one or more validated text files and returns one line-numbered text block.
 *
 * @remarks
 * This entrypoint keeps the direct-read surface layered: schema caps constrain
 * the request shape, shared filesystem preflight validates real files before
 * reads begin, projected response budgeting rejects oversized batches early,
 * and the actual formatted response is checked again before it can reach the
 * caller-visible surface.
 *
 * @param filePaths - Requested file paths that were already constrained by the schema layer.
 * @param allowedDirectories - Allowed directory roots used for metadata-first validation and preflight.
 * @returns One joined text response containing one line-numbered section per requested file, with inline per-file read failures only after shared preflight succeeds.
 */
export async function handleReadFiles(filePaths: string[], allowedDirectories: string[]): Promise<string> {
  const entries = await collectValidatedFilesystemPreflightEntries(
    READ_FILES_TOOL_NAME,
    filePaths,
    allowedDirectories,
  );

  assertExpectedFileTypes(READ_FILES_TOOL_NAME, entries, ["file"]);

  const separatorOverhead = (entries.length - 1) * 8 + entries.length * 64;
  const projectedChars =
    entries.reduce(
      (totalChars, entry) => totalChars + estimateLineNumberedResponseCharsFromBytes(entry.size),
      0,
    ) + separatorOverhead;

  assertProjectedTextBudget(
    READ_FILES_TOOL_NAME,
    projectedChars,
    READ_FILES_RESPONSE_CAP_CHARS,
    "Projected line-numbered file read output exceeds the direct-read family cap.",
    PROJECTED_READ_RECOMMENDED_ACTION,
  );

  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const { content } = await readValidatedFullTextFile(
          {
            requestedPath: entry.requestedPath,
            validPath: entry.validPath,
            totalFileBytes: entry.size,
          },
          READ_FILES_TOOL_NAME,
        );
        const numberedContent = formatLineNumberedTextContent(content);

        return `${entry.requestedPath}:\n${numberedContent}\n`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return `${entry.requestedPath}: Error - ${errorMessage}`;
      }
    }),
  );

  const response = results.join("\n---\n");

  assertActualTextBudget(
    READ_FILES_TOOL_NAME,
    response.length,
    READ_FILES_RESPONSE_CAP_CHARS,
    "Actual line-numbered file read output exceeds the direct-read family cap.",
  );

  return response;
}
