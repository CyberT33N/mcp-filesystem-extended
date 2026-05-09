import {
  COUNT_LINES_RESPONSE_CAP_CHARS,
  DISCOVERY_RESPONSE_CAP_CHARS,
  FILE_DIFF_RESPONSE_CAP_CHARS,
  FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS,
  METADATA_RESPONSE_CAP_CHARS,
  READ_FILE_CONTENT_RESPONSE_CAP_CHARS,
  READ_FILES_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
  TEXT_DIFF_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import {
  READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES,
  READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES,
  READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES,
  READ_FILE_CONTENT_LINE_RANGE_MAX_LINES,
} from "@domain/inspection/read-file-content/schema";

const TOOL_DESCRIPTION_NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function formatToolDescriptionInteger(value: number): string {
  return TOOL_DESCRIPTION_NUMBER_FORMATTER.format(value);
}

function formatToolDescriptionCharacterLimit(value: number): string {
  return `${formatToolDescriptionInteger(value)} characters`;
}

function formatToolDescriptionByteWindow(value: number): string {
  const kib = 1024;
  const mib = 1024 * 1024;

  if (value % mib === 0) {
    return `${formatToolDescriptionInteger(value / mib)} MiB`;
  }

  if (value % kib === 0) {
    return `${formatToolDescriptionInteger(value / kib)} KiB`;
  }

  return `${formatToolDescriptionInteger(value)} bytes`;
}

/**
 * Builds the caller-visible discovery-family description for `list_directory_entries`.
 */
export function buildListDirectoryEntriesToolDescription(
  structuredContinuationAuthorityDescription: string,
  listDirectoryEntriesTextSurfacingDescription: string,
  finalPreviewFirstDescription: string,
  externalConsumerBoundaryDescription: string,
): string {
  return (
    "Lists structured directory entries for one or more directory roots while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. "
    + "Required `type` and `size` are always included, while grouped timestamp and permission metadata can be requested explicitly. "
    + `Inline and \`next-chunk\` text delivery remain bounded by the discovery-family response cap of ${formatToolDescriptionCharacterLimit(DISCOVERY_RESPONSE_CAP_CHARS)}, while additive \`complete-result\` continuation follows the shared global fuse instead of that family cap. `
    + "Valid broad listing workloads may degrade into preview-first delivery that keeps primary result data complete in `content.text`. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken`; no separate continuation endpoint exists. "
    + `${structuredContinuationAuthorityDescription} `
    + "Scope reduction remains a first-class alternative: narrow roots, choose a deeper root, or set `recursive = false` when a shallow listing is sufficient. "
    + `${listDirectoryEntriesTextSurfacingDescription} `
    + "Preview-capable directory listing supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. "
    + `${finalPreviewFirstDescription} `
    + "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. "
    + `${externalConsumerBoundaryDescription}`
  );
}

/**
 * Builds the caller-visible discovery-family description for `find_paths_by_name`.
 */
export function buildFindPathsByNameToolDescription(
  structuredContinuationAuthorityDescription: string,
): string {
  return (
    "Finds file and directory paths by case-insensitive name substring while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. "
    + "Use this tool for path discovery, not for searching file contents. "
    + `Inline and \`next-chunk\` text delivery remain bounded by the discovery-family response cap of ${formatToolDescriptionCharacterLimit(DISCOVERY_RESPONSE_CAP_CHARS)}. Additive \`complete-result\` continuation follows the shared global fuse instead of that family cap. `
    + "Valid broad discovery workloads may degrade into preview-first delivery that keeps primary result data complete in `content.text`. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint. "
    + `${structuredContinuationAuthorityDescription} `
    + "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. "
    + "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. "
    + "Scope reduction remains a first-class alternative: narrow roots or make `nameContains` more specific to stay inline or reduce payload size."
  );
}

/**
 * Builds the caller-visible discovery-family description for `find_files_by_glob`.
 */
export function buildFindFilesByGlobToolDescription(
  structuredContinuationAuthorityDescription: string,
): string {
  return (
    "Finds files by glob pattern under one or more roots while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. "
    + "Use this tool when the selection is expressed in glob syntax rather than plain name matching or regex content search. "
    + `Inline and \`next-chunk\` text delivery remain bounded by the discovery-family response cap of ${formatToolDescriptionCharacterLimit(DISCOVERY_RESPONSE_CAP_CHARS)}. Additive \`complete-result\` continuation follows the shared global fuse instead of that family cap. `
    + "Valid broad discovery workloads may degrade into preview-first delivery that keeps primary result data complete in `content.text`. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint. "
    + `${structuredContinuationAuthorityDescription} `
    + "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. "
    + "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. "
    + "Scope reduction remains a first-class alternative: narrow roots, tighten `glob`, or reduce reopened descendants through `includeExcludedGlobs`."
  );
}

/**
 * Builds the caller-visible search-family description for `search_file_contents_by_regex`.
 */
export function buildSearchFileContentsByRegexToolDescription(
  structuredContinuationAuthorityDescription: string,
): string {
  return (
    "Searches text file contents with a regular expression while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. "
    + "Use this tool for content matching, not for file-name or glob matching. "
    + `Inline and \`next-chunk\` text delivery remain bounded by the regex-search family response cap of ${formatToolDescriptionCharacterLimit(REGEX_SEARCH_RESPONSE_CAP_CHARS)}. Additive \`complete-result\` continuation follows the shared global fuse instead of that family cap. `
    + "Explicit large text-compatible file scopes may proceed to the shared regex-search lane after content-state eligibility succeeds, while broad recursive workloads may degrade into preview-first delivery that keeps primary result data complete in `content.text`. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint, while structurally unsafe patterns, unsupported surfaces, and recursive workloads that still exceed the server-owned lane budgets continue to refuse. "
    + `${structuredContinuationAuthorityDescription} `
    + "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. "
    + "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. "
    + "Scope reduction remains a first-class alternative: narrow roots, add `includeGlobs`, or tighten the regex to the intended file set."
  );
}

/**
 * Builds the caller-visible search-family description for `search_file_contents_by_fixed_string`.
 */
export function buildSearchFileContentsByFixedStringToolDescription(
  structuredContinuationAuthorityDescription: string,
): string {
  return (
    "Searches text file contents with an exact fixed string while broad roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. "
    + "Use this tool for literal content matching, not for regex content matching, file-name matching, or glob matching. "
    + `Inline and \`next-chunk\` text delivery remain bounded by the fixed-string-search family response cap of ${formatToolDescriptionCharacterLimit(FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS)}. Additive \`complete-result\` continuation follows the shared global fuse instead of that family cap. `
    + "Explicit large text-compatible file scopes may proceed to the shared fixed-string-search lane after content-state eligibility succeeds, while broad recursive workloads may degrade into preview-first delivery that keeps primary result data complete in `content.text`. When more data remains, additive `admission` and `resume` metadata support same-endpoint resume through `resumeToken` on this endpoint, while unsupported surfaces and recursive workloads that still exceed the server-owned lane budgets continue to refuse. "
    + `${structuredContinuationAuthorityDescription} `
    + "This preview-capable family supports `resumeMode = 'next-chunk'` for bounded inspection and `resumeMode = 'complete-result'` for a server-owned completion attempt without bypassing hard caps. "
    + "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus the desired `resumeMode`. "
    + "Scope reduction remains a first-class alternative: narrow roots, add `includeGlobs`, or reduce the search to the relevant subtree."
  );
}

/**
 * Builds the caller-visible counting-family description for `count_lines`.
 */
export function buildCountLinesToolDescription(
  structuredContinuationAuthorityDescription: string,
): string {
  return (
    "Counts lines in files or traversed directory trees while broad directory roots exclude default vendor/cache trees unless callers target them explicitly or reopen descendants with additive overrides such as `includeExcludedGlobs` or optional `.gitignore` enrichment. "
    + "Use this tool for totals and filtered line counting, not for reading full file content. "
    + `Final inline and aggregated counting output remain bounded by the count-family response cap of ${formatToolDescriptionCharacterLimit(COUNT_LINES_RESPONSE_CAP_CHARS)}, while broad workloads continue only through same-endpoint \`complete-result\` resume instead of preview-style partial totals. `
    + "Total-only counts use a large-file-safe streaming path, pattern-aware counts reuse the shared native-search lane, and broad workloads that leave the inline band return completion-backed `resumeToken` metadata on this same endpoint instead of partial preview totals. "
    + `${structuredContinuationAuthorityDescription} `
    + "This family supports only `resumeMode = 'complete-result'`; preview-style partial totals and `next-chunk` are never exposed. "
    + "Resume only when `structuredContent.resume.resumable` is true and a non-null `resumeToken` is present, using the same endpoint and only that token plus `resumeMode = 'complete-result'`. "
    + "Scope reduction remains a first-class alternative: narrow `paths`, reduce recursive breadth, or constrain files with `includeGlobs`."
  );
}

/**
 * Builds the caller-visible diff-family description for `diff_files`.
 */
export function buildDiffFilesToolDescription(): string {
  return (
    "Compares the contents of one or more file pairs and returns unified diffs. "
    + "Use this tool when the comparison source is already stored on disk. "
    + `Successful responses remain bounded by the file-backed diff family response cap of ${formatToolDescriptionCharacterLimit(FILE_DIFF_RESPONSE_CAP_CHARS)}, so callers must narrow or split oversized comparison sets. `
    + "Pair-count and response-size budgets are enforced server-side, so narrow the comparison set when a projected diff is refused."
  );
}

/**
 * Builds the caller-visible diff-family description for `diff_text_content`.
 */
export function buildDiffTextContentToolDescription(): string {
  return (
    "Compares one or more in-memory text content pairs and returns unified diffs. "
    + "Use this tool when the compared inputs are provided directly rather than read from files. "
    + `Successful responses remain bounded by the raw-text diff family response cap of ${formatToolDescriptionCharacterLimit(TEXT_DIFF_RESPONSE_CAP_CHARS)}, so callers must shorten or split oversized in-memory comparison sets. `
    + "Stricter raw-text and response-size budgets are enforced server-side for caller-supplied content, so oversized text pairs are refused."
  );
}

/**
 * Builds the caller-visible metadata-family description for `get_path_metadata`.
 */
export function buildGetPathMetadataToolDescription(): string {
  return (
    "Returns structured metadata for one or more files or directories. "
    + "Required `size` and `type` are always included, while grouped timestamp and permission metadata can be requested explicitly. "
    + "Public request parameters carry the path-length and batch-size ceilings directly. "
    + `Caller-visible metadata output remains bounded by the metadata-family response cap of ${formatToolDescriptionCharacterLimit(METADATA_RESPONSE_CAP_CHARS)}, so oversized multi-path requests may still be refused. `
    + "This endpoint does not use preview-style resume behavior."
  );
}

/**
 * Builds the caller-visible metadata-family description for `get_file_checksums`.
 */
export function buildGetFileChecksumsToolDescription(): string {
  return (
    "Generates checksums for one or more files using a selected hash algorithm. "
    + "Use this tool for hash generation, not for verification against expected values. "
    + "Public request parameters carry the path-length, batch-size, and algorithm-selection limits directly. "
    + `Caller-visible checksum output remains bounded by the metadata-family response cap of ${formatToolDescriptionCharacterLimit(METADATA_RESPONSE_CAP_CHARS)}, so oversized multi-file requests may still be refused. `
    + "This endpoint does not use preview-style resume behavior."
  );
}

/**
 * Builds the caller-visible metadata-family description for `verify_file_checksums`.
 */
export function buildVerifyFileChecksumsToolDescription(): string {
  return (
    "Verifies one or more files against expected hash values. "
    + "Use this tool when an expected checksum is already known. "
    + "Public request parameters carry the path-length, expected-hash, batch-size, and algorithm-selection limits directly. "
    + `Caller-visible verification output remains bounded by the metadata-family response cap of ${formatToolDescriptionCharacterLimit(METADATA_RESPONSE_CAP_CHARS)}, so oversized multi-file verification requests may still be refused. `
    + "This endpoint does not use preview-style resume behavior."
  );
}

/**
 * Builds the caller-visible mutation-family description for `create_files`.
 */
export function buildCreateFilesToolDescription(): string {
  return (
    "Creates one or more new text files. "
    + "Use this tool only when the target files do not already exist. "
    + "Public request parameters carry the per-file and batch creation ceilings directly, while successful output remains a concise mutation summary rather than a large echoed payload. "
    + "Oversized payloads are refused rather than truncated."
  );
}

/**
 * Builds the caller-visible mutation-family description for `append_files`.
 */
export function buildAppendFilesToolDescription(): string {
  return (
    "Appends text content to one or more files. "
    + "Use this tool for additive writes at file end, not targeted replacement. "
    + "Public request parameters carry the per-file and batch append ceilings directly, while successful output remains a concise mutation summary rather than a large echoed payload. "
    + "Oversized payloads are refused rather than truncated."
  );
}

/**
 * Builds the caller-visible mutation-family description for `replace_file_line_ranges`.
 */
export function buildReplaceFileLineRangesToolDescription(): string {
  return (
    "Replaces one or more 1-based inclusive line ranges in existing text files. "
    + "Use this tool for direct line-range replacement, not unified diff patch text. "
    + "Public request parameters carry the per-file replacement-count, replacement-text, and cumulative input ceilings directly. "
    + `Preview output remains bounded by the file-backed diff family response cap of ${formatToolDescriptionCharacterLimit(FILE_DIFF_RESPONSE_CAP_CHARS)}, so reduce the replacement scope when preview shaping is refused.`
  );
}

/**
 * Builds the caller-visible mutation-family description for `create_directories`.
 */
export function buildCreateDirectoriesToolDescription(): string {
  return (
    "Creates one or more directory paths, including missing parent directories. "
    + "Use this tool for directory creation only. "
    + "Public request parameters carry the bounded path-batch limits directly, while successful output remains a concise path-mutation summary."
  );
}

/**
 * Builds the caller-visible mutation-family description for `copy_paths`.
 */
export function buildCopyPathsToolDescription(): string {
  return (
    "Copies files or directories to new destinations. "
    + "Creates missing destination parent directories recursively, so do not call create_directories first. "
    + "Use this tool when the source should remain in place after the operation. "
    + "Public request parameters carry the bounded operation and path limits directly, and unsafe overlap or overwrite conditions still refuse server-side."
  );
}

/**
 * Builds the caller-visible mutation-family description for `move_paths`.
 */
export function buildMovePathsToolDescription(): string {
  return (
    "Moves or renames files or directories. "
    + "Creates missing destination parent directories recursively, so do not call create_directories first. "
    + "Use this tool when the source should no longer remain at the original path. "
    + "Public request parameters carry the bounded operation and path limits directly, and unsafe overwrite or relocation conditions still refuse server-side."
  );
}

/**
 * Builds the caller-visible mutation-family description for `delete_paths`.
 */
export function buildDeletePathsToolDescription(): string {
  return (
    "Deletes files or directories. "
    + "Use this tool only for removal, not for in-place rewrite workflows. "
    + "Public request parameters carry the bounded target-count and path-length limits directly, and directories still require explicit recursive intent."
  );
}

/**
 * Builds the caller-visible server-scope description for `list_allowed_directories`.
 */
export function buildListAllowedDirectoriesToolDescription(): string {
  return (
    "Lists the directory roots this MCP server may access. "
    + "Use this tool to discover the effective filesystem scope before other path-based calls. "
    + "This server-scope surface has no caller-supplied request payload and returns a compact text-only scope list, so no additional numeric per-tool limit disclosure is prioritized here."
  );
}

/**
 * Shared application-layer annotation presets reused across extracted registration modules.
 */
export const READ_ONLY_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Shared application-layer annotations for additive tools.
 */
export const ADDITIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/**
 * Shared application-layer annotations for idempotent additive tools.
 */
export const IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Shared application-layer annotations for destructive tools.
 */
export const DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

/**
 * Builds the caller-visible read-family description for `read_files_with_line_numbers`
 * from shared guardrail constants.
 */
export function buildReadFilesWithLineNumbersToolDescription(): string {
  return (
    "Reads one or more text files and returns line-numbered content blocks. "
    + "Use this tool for direct bounded batch reading, not for metadata lookup or content search. "
    + `Successful responses stay within the direct-read family response cap of ${formatToolDescriptionCharacterLimit(READ_FILES_RESPONSE_CAP_CHARS)}, so oversized multi-file batches may be refused before or after read shaping. `
    + "Reduce file count or switch a large individual file to `read_file_content` with `line-range` or `chunk-cursor` when the projected output would exceed that cap."
  );
}

/**
 * Builds the caller-visible read-family description for `read_file_content`
 * from shared guardrail constants and mode-specific bounded-read constants.
 */
export function buildReadFileContentToolDescription(): string {
  return (
    "Reads one text file through explicit `full`, `line-range`, `byte-range`, or `chunk-cursor` modes while large-file access stays bounded by shared runtime policy and response budgets. "
    + "Use this tool for single-file content access, not for metadata lookup, multi-file batch reads, or content search. "
    + `Successful inline responses stay within the direct-read family response cap of ${formatToolDescriptionCharacterLimit(READ_FILE_CONTENT_RESPONSE_CAP_CHARS)}. `
    + "The ranged and cursor modes accept their mode-specific option blocks (`line_range`, `byte_range`, `chunk_cursor`) and are normalized at the MCP boundary into the canonical bounded-read contract. "
    + `\`line-range\` defaults to ${formatToolDescriptionInteger(READ_FILE_CONTENT_LINE_RANGE_DEFAULT_LINES)} lines and is hard-capped at ${formatToolDescriptionInteger(READ_FILE_CONTENT_LINE_RANGE_MAX_LINES)} lines; `
    + `\`byte-range\` and \`chunk-cursor\` default to ${formatToolDescriptionByteWindow(READ_FILE_CONTENT_BYTE_RANGE_DEFAULT_BYTES)} and are hard-capped at ${formatToolDescriptionByteWindow(READ_FILE_CONTENT_BYTE_RANGE_MAX_BYTES)} per request window. `
    + "A legal `byteCount` still is not a guarantee that the decoded response will fit, so callers must reduce the window when runtime budgeting rejects the chunk. "
    + "Full mode remains limited to smaller files; valid larger access must switch to range or cursor modes, while unsupported or over-hard-gap workloads still refuse."
  );
}
