import {
  getPathMetadataResult,
  handleGetPathMetadata,
} from "@domain/inspection/get-path-metadata/handler";
import {
  GetPathMetadataArgsSchema,
  GetPathMetadataResultSchema,
} from "@domain/inspection/get-path-metadata/schema";
import {
  getListDirectoryEntriesResult,
  handleListDirectoryEntries,
} from "@domain/inspection/list-directory-entries/handler";
import {
  ListDirectoryEntriesArgsSchema,
  ListDirectoryEntriesStructuredResultSchema,
} from "@domain/inspection/list-directory-entries/schema";
import { handleReadFiles } from "@domain/inspection/read-files-with-line-numbers/handler";
import { ReadFilesWithLineNumbersArgsSchema } from "@domain/inspection/read-files-with-line-numbers/schema";
import {
  getReadFileContentResult,
  handleReadFileContent,
} from "@domain/inspection/read-file-content/handler";
import {
  ReadFileContentArgsSchema,
  ReadFileContentResultSchema,
  normalizeReadFileContentArgs,
} from "@domain/inspection/read-file-content/schema";
import {
  getFindPathsByNameResult,
  handleSearchFiles,
} from "@domain/inspection/find-paths-by-name/handler";
import {
  FindPathsByNameArgsSchema,
  FindPathsByNameResultSchema,
} from "@domain/inspection/find-paths-by-name/schema";
import {
  getFindFilesByGlobResult,
  handleSearchGlob,
} from "@domain/inspection/find-files-by-glob/handler";
import {
  FindFilesByGlobArgsSchema,
  FindFilesByGlobResultSchema,
} from "@domain/inspection/find-files-by-glob/schema";
import { handleSearchRegex, getSearchRegexResult as getSearchRegexStructuredResult } from "@domain/inspection/search-file-contents-by-regex/handler";
import {
  SearchFileContentsByRegexArgsSchema,
  SearchFileContentsByRegexResultSchema,
} from "@domain/inspection/search-file-contents-by-regex/schema";
import { handleSearchFixedString, getSearchFixedStringResult as getSearchFixedStringStructuredResult } from "@domain/inspection/search-file-contents-by-fixed-string/handler";
import {
  SearchFileContentsByFixedStringArgsSchema,
  SearchFileContentsByFixedStringResultSchema,
} from "@domain/inspection/search-file-contents-by-fixed-string/schema";
import {
  formatCountLinesResultOutput,
  getCountLinesResult,
} from "@domain/inspection/count-lines/handler";
import {
  CountLinesArgsSchema,
  CountLinesResultSchema,
} from "@domain/inspection/count-lines/schema";
import {
  getFileChecksumsResult,
  handleChecksumFiles,
} from "@domain/inspection/get-file-checksums/handler";
import {
  GetFileChecksumsArgsSchema,
  GetFileChecksumsResultSchema,
} from "@domain/inspection/get-file-checksums/schema";
import {
  getFileChecksumVerificationResult,
  handleChecksumFilesVerif,
} from "@domain/inspection/verify-file-checksums/handler";
import {
  VerifyFileChecksumsArgsSchema,
  VerifyFileChecksumsResultSchema,
} from "@domain/inspection/verify-file-checksums/schema";

import type { RegisterToolCatalogContext } from "./register-tool-catalog";
import { READ_ONLY_LOCAL_TOOL_ANNOTATIONS } from "./tool-registration-presets";

const STRUCTURED_CONTINUATION_AUTHORITY_DESCRIPTION =
  "When additive `admission` and `resume` metadata are returned, `structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only.";

const TOKEN_ONLY_RESUME_DESCRIPTION =
  "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`.";

const FINAL_PREVIEW_FIRST_DESCRIPTION =
  "A preview-first response may finalize without an active resume token only when the current bounded final payload is already present in `structuredContent` and no further resume step exists.";

const EXTERNAL_CONSUMER_BOUNDARY_DESCRIPTION =
  "Consumers that expose only `content.text` while dropping `structuredContent` are outside this server-owned contract and are responsible for any apparent resumeToken or bounded-payload loss.";

const LIST_DIRECTORY_ENTRIES_TEXT_SURFACING_DESCRIPTION =
  "For `list_directory_entries`, preview-first responses may also surface the current bounded directory-entry chunk and any active `resumeToken` in `content.text` so text-only consumers keep a usable same-endpoint continuation path while `structuredContent` remains authoritative.";

/**
 * Registers only the inspection tool family on the application-layer MCP server shell.
 *
 * @remarks
 * The visible inspection contract must guide callers toward narrower requests without implying that
 * hard caps are optional. Tool descriptions therefore summarize schema caps, metadata-first
 * preflights, and runtime refusal behavior qualitatively while leaving numeric ownership in the
 * shared guardrail modules.
 */
export function registerInspectionToolCatalog(context: RegisterToolCatalogContext): void {
  const {
    server,
    allowedDirectories,
    executeTool,
    inspectionResumeSessionStore,
  } = context;

  server.registerTool(
    "read_files_with_line_numbers",
    {
      title: "Read files with line numbers",
      description:
        "Reads one or more text files and returns line-numbered content blocks. " +
        "Use this tool for direct bounded batch reading, not for metadata lookup or content search. " +
        "This surface remains the inline multi-file reader for smaller workloads; reduce file count or switch to `read_file_content` for larger single-file access.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFilesWithLineNumbersArgsSchema,
    },
    async ({ paths }) =>
      executeTool("read_files_with_line_numbers", () => handleReadFiles(paths, allowedDirectories)),
  );

  server.registerTool(
    "read_file_content",
    {
      title: "Read file content",
      description:
        "Reads one text file through explicit `full`, `line-range`, `byte-range`, or `chunk-cursor` modes while large-file access stays bounded by shared runtime policy and response budgets. " +
        "Use this tool for single-file content access, not for metadata lookup, multi-file batch reads, or content search. " +
        "The ranged and cursor modes accept their mode-specific option blocks (`line_range`, `byte_range`, `chunk_cursor`) and are normalized at the MCP boundary into the canonical bounded-read contract. " +
        "Full mode remains limited to smaller files; valid larger access must switch to range or cursor modes, while unsupported or over-hard-gap workloads still refuse.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ReadFileContentArgsSchema,
      outputSchema: ReadFileContentResultSchema,
    },
    async (args) =>
      executeTool("read_file_content", async () => {
        const normalizedArgs = normalizeReadFileContentArgs(args);
        const result = await getReadFileContentResult(normalizedArgs, allowedDirectories);
        const text = await handleReadFileContent(normalizedArgs, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: result,
        };
      }),
  );

  server.registerTool(
    "list_directory_entries",
    {
      title: "List directory entries",
      description:
        "Lists structured directory entries for one or more directory roots while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Required `type` and `size` are always included, while grouped timestamp and permission metadata can be requested explicitly. " +
        "Valid broad listing workloads may degrade into preview-first delivery that keeps `structuredContent` authoritative and may collapse caller-visible text to compact guidance. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken`; no separate continuation endpoint exists. " +
        "`structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only. " +
        "Scope reduction remains a first-class alternative: narrow roots, choose a deeper root, or set `recursive = false` when a shallow listing is sufficient. " +
        "For `list_directory_entries`, preview-first responses may also surface the current bounded directory-entry chunk and any active `resumeToken` in `content.text` so text-only consumers keep a usable same-endpoint continuation path while `structuredContent` remains authoritative. " +
        "Preview-capable directory listing supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. " +
        "A preview-first response may finalize without an active resume token only when the current bounded final payload is already present in `structuredContent` and no further resume step exists. " +
        "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. " +
        `${EXTERNAL_CONSUMER_BOUNDARY_DESCRIPTION}`,
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: ListDirectoryEntriesArgsSchema,
      outputSchema: ListDirectoryEntriesStructuredResultSchema,
    },
    async ({ resumeToken, resumeMode, roots, recursive, metadata, excludeGlobs, respectGitIgnore, includeExcludedGlobs }) =>
      executeTool("list_directory_entries", async () => {
        const result = await getListDirectoryEntriesResult(
          resumeToken,
          resumeMode,
          roots,
          recursive,
          metadata,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          inspectionResumeSessionStore,
        );
        const text = await handleListDirectoryEntries(
          resumeToken,
          resumeMode,
          roots,
          recursive,
          metadata,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          allowedDirectories,
          inspectionResumeSessionStore,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "find_paths_by_name",
    {
      title: "Find paths by name",
      description:
        "Finds file and directory paths by case-insensitive name substring while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for path discovery, not for searching file contents. " +
        "Valid broad discovery workloads may degrade into preview-first delivery that keeps `structuredContent` authoritative and may collapse caller-visible text to compact guidance. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint. " +
        "`structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only. " +
        "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. " +
        "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. " +
        "Scope reduction remains a first-class alternative: narrow roots or make `nameContains` more specific to stay inline or reduce payload size.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindPathsByNameArgsSchema,
      outputSchema: FindPathsByNameResultSchema,
    },
    async ({ resumeToken, resumeMode, roots, nameContains, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults }) =>
      executeTool("find_paths_by_name", async () => {
        const result = await getFindPathsByNameResult(
          resumeToken,
          resumeMode,
          roots,
          nameContains,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          inspectionResumeSessionStore,
          allowedDirectories,
          maxResults,
        );
        const text = await handleSearchFiles(
          resumeToken,
          resumeMode,
          roots,
          nameContains,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          inspectionResumeSessionStore,
          allowedDirectories,
          maxResults,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "find_files_by_glob",
    {
      title: "Find files by glob",
      description:
        "Finds files by glob pattern under one or more roots while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool when the selection is expressed in glob syntax rather than plain name matching or regex content search. " +
        "Valid broad discovery workloads may degrade into preview-first delivery that keeps `structuredContent` authoritative and may collapse caller-visible text to compact guidance. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint. " +
        "`structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only. " +
        "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. " +
        "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. " +
        "Scope reduction remains a first-class alternative: narrow roots, tighten `glob`, or reduce reopened descendants through `includeExcludedGlobs`.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: FindFilesByGlobArgsSchema,
      outputSchema: FindFilesByGlobResultSchema,
    },
    async ({ resumeToken, resumeMode, roots, glob, excludeGlobs, includeExcludedGlobs, respectGitIgnore, maxResults }) =>
      executeTool("find_files_by_glob", async () => {
        const result = await getFindFilesByGlobResult(
          resumeToken,
          resumeMode,
          roots,
          glob,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories,
          inspectionResumeSessionStore,
        );
        const text = await handleSearchGlob(
          resumeToken,
          resumeMode,
          roots,
          glob,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          allowedDirectories,
          inspectionResumeSessionStore,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "search_file_contents_by_regex",
    {
      title: "Search file contents by regex",
      description:
        "Searches text file contents with a regular expression while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for content matching, not for file-name or glob matching. " +
        "Valid large text workloads may degrade into preview-first delivery that keeps `structuredContent` authoritative and may collapse caller-visible text to compact guidance. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint, while structurally unsafe patterns, unsupported surfaces, and over-hard-gap workloads still refuse. " +
        "`structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only. " +
        "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. " +
        "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. " +
        "Scope reduction remains a first-class alternative: narrow roots, add `includeGlobs`, or tighten the regex to the intended file set.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByRegexArgsSchema,
      outputSchema: SearchFileContentsByRegexResultSchema,
    },
    async (args) =>
      executeTool("search_file_contents_by_regex", async () => {
        const resumeToken = args.resumeToken;
        const resumeMode = args.resumeMode;
        const roots = "roots" in args ? args.roots : [];
        const regex = "regex" in args ? args.regex : "";
        const includeGlobs = "includeGlobs" in args ? args.includeGlobs : [];
        const excludeGlobs = "excludeGlobs" in args ? args.excludeGlobs : [];
        const includeExcludedGlobs = "includeExcludedGlobs" in args ? args.includeExcludedGlobs : [];
        const respectGitIgnore = "respectGitIgnore" in args ? args.respectGitIgnore : false;
        const maxResults = "maxResults" in args ? args.maxResults : 100;
        const caseSensitive = "caseSensitive" in args ? args.caseSensitive : false;

        const result = await getSearchRegexStructuredResult(
          resumeToken,
          resumeMode,
          roots,
          regex,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
          inspectionResumeSessionStore,
        );
        const text = await handleSearchRegex(
          resumeToken,
          resumeMode,
          roots,
          regex,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
          inspectionResumeSessionStore,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalLocations: result.totalLocations,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "search_file_contents_by_fixed_string",
    {
      title: "Search file contents by fixed string",
      description:
        "Searches text file contents with an exact fixed string while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for literal content matching, not for regex content matching, file-name matching, or glob matching. " +
        "Valid large text workloads may degrade into preview-first delivery that keeps `structuredContent` authoritative and may collapse caller-visible text to compact guidance. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint, while unsupported or over-hard-gap workloads still refuse. " +
        "`structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only. " +
        "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. " +
        "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. " +
        "Scope reduction remains a first-class alternative: narrow roots, add `includeGlobs`, or reduce the search to the relevant subtree.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: SearchFileContentsByFixedStringArgsSchema,
      outputSchema: SearchFileContentsByFixedStringResultSchema,
    },
    async (args) =>
      executeTool("search_file_contents_by_fixed_string", async () => {
        const resumeToken = args.resumeToken;
        const resumeMode = args.resumeMode;
        const roots = "roots" in args ? args.roots : [];
        const fixedString = "fixedString" in args ? args.fixedString : "";
        const includeGlobs = "includeGlobs" in args ? args.includeGlobs : [];
        const excludeGlobs = "excludeGlobs" in args ? args.excludeGlobs : [];
        const includeExcludedGlobs = "includeExcludedGlobs" in args ? args.includeExcludedGlobs : [];
        const respectGitIgnore = "respectGitIgnore" in args ? args.respectGitIgnore : false;
        const maxResults = "maxResults" in args ? args.maxResults : 100;
        const caseSensitive = "caseSensitive" in args ? args.caseSensitive : false;

        const result = await getSearchFixedStringStructuredResult(
          resumeToken,
          resumeMode,
          roots,
          fixedString,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
          inspectionResumeSessionStore,
        );
        const text = await handleSearchFixedString(
          resumeToken,
          resumeMode,
          roots,
          fixedString,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          maxResults,
          caseSensitive,
          allowedDirectories,
          inspectionResumeSessionStore,
        );

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            roots: result.roots,
            totalLocations: result.totalLocations,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "count_lines",
    {
      title: "Count lines",
      description:
        "Counts lines in files or traversed directory trees while broad directory roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. " +
        "Use this tool for totals and filtered line counting, not for reading full file content. " +
        "Total-only counts use a large-file-safe streaming path, pattern-aware counts reuse the shared native-search lane, and broad workloads that leave the inline band return completion-backed `resumeToken` metadata on this same endpoint instead of partial preview totals. " +
        "`structuredContent.admission` and `structuredContent.resume` remain authoritative while `content.text` may collapse to compact guidance only. " +
        "This family supports only `resumeMode = 'complete-result'`; preview-style partial totals and `next-chunk` are never exposed. " +
        "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus `resumeMode = 'complete-result'`. " +
        "Scope reduction remains a first-class alternative: narrow `paths`, reduce recursive breadth, or constrain files with `includeGlobs`.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: CountLinesArgsSchema,
      outputSchema: CountLinesResultSchema,
    },
    async ({ resumeToken, resumeMode, paths, recursive, regex, includeGlobs, excludeGlobs, includeExcludedGlobs, respectGitIgnore, ignoreEmptyLines }) =>
      executeTool("count_lines", async () => {
        const result = await getCountLinesResult(
          resumeToken,
          resumeMode,
          paths,
          recursive,
          regex,
          includeGlobs,
          excludeGlobs,
          includeExcludedGlobs,
          respectGitIgnore,
          ignoreEmptyLines,
          inspectionResumeSessionStore,
          allowedDirectories,
        );
        const text = formatCountLinesResultOutput(result, regex);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            paths: result.paths,
            totalFiles: result.totalFiles,
            totalLines: result.totalLines,
            totalMatchingLines: result.totalMatchingLines,
            admission: result.admission,
            resume: result.resume,
          },
        };
      }),
  );

  server.registerTool(
    "get_file_checksums",
    {
      title: "Get file checksums",
      description:
        "Generates checksums for one or more files using a selected hash algorithm. " +
        "Use this tool for hash generation, not for verification against expected values. " +
        "Results remain bounded by server safety caps, and oversized multi-file requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: GetFileChecksumsArgsSchema,
      outputSchema: GetFileChecksumsResultSchema,
    },
    async ({ paths, algorithm }) =>
      executeTool("get_file_checksums", async () => {
        const result = await getFileChecksumsResult(paths, algorithm, allowedDirectories);
        const text = await handleChecksumFiles(paths, algorithm, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
          },
        };
      }),
  );

  server.registerTool(
    "verify_file_checksums",
    {
      title: "Verify file checksums",
      description:
        "Verifies one or more files against expected hash values. " +
        "Use this tool when an expected checksum is already known. " +
        "Results remain bounded by server safety caps, and oversized multi-file requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: VerifyFileChecksumsArgsSchema,
      outputSchema: VerifyFileChecksumsResultSchema,
    },
    async ({ files, algorithm }) =>
      executeTool("verify_file_checksums", async () => {
        const result = await getFileChecksumVerificationResult(
          files,
          algorithm,
          allowedDirectories,
        );
        const text = await handleChecksumFilesVerif(files, algorithm, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
            summary: result.summary,
          },
        };
      }),
  );

  server.registerTool(
    "get_path_metadata",
    {
      title: "Get path metadata",
      description:
        "Returns structured metadata for one or more files or directories. " +
        "Required `size` and `type` are always included, while grouped timestamp and permission metadata can be requested explicitly. " +
        "Results remain bounded by server safety caps, and oversized multi-path requests may be refused when the projected response would exceed those caps.",
      annotations: READ_ONLY_LOCAL_TOOL_ANNOTATIONS,
      inputSchema: GetPathMetadataArgsSchema,
      outputSchema: GetPathMetadataResultSchema,
    },
    async ({ paths, metadata }) =>
      executeTool("get_path_metadata", async () => {
        const result = await getPathMetadataResult(paths, metadata, allowedDirectories);
        const text = await handleGetPathMetadata(paths, metadata, allowedDirectories);

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            entries: result.entries,
            errors: result.errors,
          },
        };
      }),
  );
}
