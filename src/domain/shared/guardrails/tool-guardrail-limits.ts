/**
 * Defines the canonical shared guardrail ceilings that endpoint schemas, runtime helpers,
 * and the application-layer response fuse must import instead of re-declaring local literals.
 *
 * @remarks
 * Static request-surface caps and runtime budgets are separated on purpose.
 * Schema caps reject obviously abusive request shapes before handler execution starts,
 * while runtime budgets govern post-validation execution and response shaping once real
 * filesystem or diff workload characteristics are known. These values are server-owned,
 * non-bypassable ceilings that preserve one same-concept limit surface across schemas,
 * handlers, and the final application-layer fuse.
 */

/**
 * Maximum identifier length for stable request-contract tokens.
 *
 * @remarks
 * Apply this ceiling to compact identifier-like fields whose value should remain machine-friendly
 * and semantically stable across schemas.
 *
 * @example
 * `z.string().max(IDENTIFIER_MAX_CHARS)`
 */
export const IDENTIFIER_MAX_CHARS = 128;

/**
 * Maximum label length for human-readable contract labels.
 *
 * @remarks
 * Use this limit for descriptive labels or names that are meant to stay readable without becoming
 * an uncontrolled text surface.
 *
 * @example
 * `z.string().max(LABEL_MAX_CHARS)`
 */
export const LABEL_MAX_CHARS = 256;

/**
 * Maximum length for a single filesystem path or root string.
 *
 * @remarks
 * This ceiling protects path-bearing request fields from unbounded single-string growth while
 * still allowing deep local filesystem targets.
 *
 * @example
 * `z.string().max(PATH_MAX_CHARS)`
 */
export const PATH_MAX_CHARS = 4_096;

/**
 * Maximum length for one glob pattern supplied by a caller.
 *
 * @remarks
 * Apply this limit to include or exclude glob strings so pattern-based discovery remains bounded
 * before handler work begins.
 *
 * @example
 * `z.string().max(GLOB_PATTERN_MAX_CHARS)`
 */
export const GLOB_PATTERN_MAX_CHARS = 1_024;

/**
 * Maximum length for a raw regex pattern string.
 *
 * @remarks
 * This schema-level ceiling constrains the strongest caller-controlled search input before the
 * runtime safety layer compiles and evaluates the pattern.
 *
 * @example
 * `z.string().max(REGEX_PATTERN_MAX_CHARS)`
 */
export const REGEX_PATTERN_MAX_CHARS = 2_048;

/**
 * Maximum length for hash-related string surfaces.
 *
 * @remarks
 * Use this ceiling for digest or algorithm-oriented string inputs where long arbitrary text would
 * not add legitimate value.
 *
 * @example
 * `z.string().max(HASH_STRING_MAX_CHARS)`
 */
export const HASH_STRING_MAX_CHARS = 256;

/**
 * Maximum length for concise freeform text fields.
 *
 * @remarks
 * This limit fits short explanatory or summary-style text fields that need more room than labels
 * but should never become raw content payloads.
 *
 * @example
 * `z.string().max(SHORT_TEXT_MAX_CHARS)`
 */
export const SHORT_TEXT_MAX_CHARS = 2_048;

/**
 * Maximum length for one raw content field supplied directly by a caller.
 *
 * @remarks
 * Apply this ceiling to content-bearing request properties before cumulative request budgets are
 * evaluated across the broader operation.
 *
 * @example
 * `z.string().max(RAW_CONTENT_MAX_CHARS)`
 */
export const RAW_CONTENT_MAX_CHARS = 100_000;

/**
 * Maximum length for one canonical `replacementText` payload.
 *
 * @remarks
 * This constant preserves the single same-concept limit surface for line-range replacement text
 * and must remain aligned with the canonical `replacementText` property name.
 *
 * @example
 * `z.string().max(REPLACEMENT_TEXT_MAX_CHARS)`
 */
export const REPLACEMENT_TEXT_MAX_CHARS = 50_000;

/**
 * Maximum number of include globs allowed in one request.
 *
 * @remarks
 * Use this ceiling where callers can narrow candidate scope with positive glob filters without
 * turning one request into an unbounded pattern bundle.
 *
 * @example
 * `z.array(globSchema).max(MAX_INCLUDE_GLOBS_PER_REQUEST)`
 */
export const MAX_INCLUDE_GLOBS_PER_REQUEST = 32;

/**
 * Maximum number of exclude globs allowed in one request.
 *
 * @remarks
 * Exclude filters are intentionally allowed to be broader than include filters, but they still
 * remain bounded as a schema-level request-shape control.
 *
 * @example
 * `z.array(globSchema).max(MAX_EXCLUDE_GLOBS_PER_REQUEST)`
 */
export const MAX_EXCLUDE_GLOBS_PER_REQUEST = 64;

/**
 * Maximum number of generic path strings allowed in one request.
 *
 * @remarks
 * This ceiling is the broad path-batch limit for request surfaces that accept many concrete
 * filesystem targets but do not need a stricter family-specific root cap.
 *
 * @example
 * `z.array(pathSchema).max(MAX_GENERIC_PATHS_PER_REQUEST)`
 */
export const MAX_GENERIC_PATHS_PER_REQUEST = 512;

/**
 * Maximum number of discovery roots allowed in one request.
 *
 * @remarks
 * Discovery-oriented endpoints need their own root budget because recursive breadth can grow long
 * before any result body is serialized.
 *
 * @example
 * `z.array(pathSchema).max(MAX_DISCOVERY_ROOTS_PER_REQUEST)`
 */
export const MAX_DISCOVERY_ROOTS_PER_REQUEST = 128;

/**
 * Maximum number of regex-search roots allowed in one request.
 *
 * @remarks
 * Regex endpoints use a tighter root ceiling than generic discovery because each root can amplify
 * candidate-byte growth during runtime scanning.
 *
 * @example
 * `z.array(pathSchema).max(MAX_REGEX_ROOTS_PER_REQUEST)`
 */
export const MAX_REGEX_ROOTS_PER_REQUEST = 64;

/**
 * Maximum number of path-mutation operations allowed in one request.
 *
 * @remarks
 * Apply this ceiling to mutation batches so destructive or broad filesystem operations stay inside
 * a bounded blast-radius envelope before handlers begin side effects.
 *
 * @example
 * `z.array(operationSchema).max(MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST)`
 */
export const MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST = 200;

/**
 * Maximum number of content-bearing file entries allowed in one request.
 *
 * @remarks
 * Content mutation surfaces are primarily constrained by cumulative payload risk, but file count is
 * still bounded to prevent oversized write batches.
 *
 * @example
 * `z.array(filePayloadSchema).max(MAX_CONTENT_FILES_PER_REQUEST)`
 */
export const MAX_CONTENT_FILES_PER_REQUEST = 50;

/**
 * Maximum number of file-backed comparison pairs allowed in one request.
 *
 * @remarks
 * Use this ceiling for diff workloads whose inputs are resolved from files rather than supplied as
 * raw in-memory text.
 *
 * @example
 * `z.array(pairSchema).max(MAX_COMPARISON_PAIRS_PER_REQUEST)`
 */
export const MAX_COMPARISON_PAIRS_PER_REQUEST = 25;

/**
 * Maximum number of raw-text diff pairs allowed in one request.
 *
 * @remarks
 * In-memory diff requests are more abuse-prone because callers inject the full text surface, so
 * they use a stricter pair-count ceiling than file-backed comparisons.
 *
 * @example
 * `z.array(textPairSchema).max(MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST)`
 */
export const MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST = 10;

/**
 * Maximum number of line replacements allowed for one file.
 *
 * @remarks
 * This ceiling keeps line-range replacement requests bounded before preview, diff, and replacement
 * text budgets are evaluated.
 *
 * @example
 * `z.array(replacementSchema).max(MAX_REPLACEMENTS_PER_FILE)`
 */
export const MAX_REPLACEMENTS_PER_FILE = 25;

/**
 * Maximum aggregate raw-text input budget across one request.
 *
 * @remarks
 * Apply this ceiling after per-field text caps so multi-item requests cannot combine many locally
 * valid content fields into one oversized raw-text workload.
 *
 * @example
 * `if (totalChars > MAX_TOTAL_RAW_TEXT_REQUEST_CHARS) rejectRequest()`
 */
export const MAX_TOTAL_RAW_TEXT_REQUEST_CHARS = 200_000;

/**
 * Canonical request-surface ceilings grouped by semantic property class.
 *
 * @remarks
 * These caps stay intentionally high on path- and batch-oriented surfaces to avoid false-positive
 * blocking of legitimate local workflows, while raw free-text and regex-oriented surfaces remain
 * more tightly bounded because they are the strongest amplification points for abusive requests.
 *
 * @example
 * `const pathCap = TOOL_GUARDRAIL_LIMITS.MAX_GENERIC_PATHS_PER_REQUEST`
 */
export const TOOL_GUARDRAIL_LIMITS = Object.freeze({
  IDENTIFIER_MAX_CHARS,
  LABEL_MAX_CHARS,
  PATH_MAX_CHARS,
  GLOB_PATTERN_MAX_CHARS,
  REGEX_PATTERN_MAX_CHARS,
  HASH_STRING_MAX_CHARS,
  SHORT_TEXT_MAX_CHARS,
  RAW_CONTENT_MAX_CHARS,
  REPLACEMENT_TEXT_MAX_CHARS,
  MAX_INCLUDE_GLOBS_PER_REQUEST,
  MAX_EXCLUDE_GLOBS_PER_REQUEST,
  MAX_GENERIC_PATHS_PER_REQUEST,
  MAX_DISCOVERY_ROOTS_PER_REQUEST,
  MAX_REGEX_ROOTS_PER_REQUEST,
  MAX_OPERATIONS_PER_PATH_MUTATION_REQUEST,
  MAX_CONTENT_FILES_PER_REQUEST,
  MAX_COMPARISON_PAIRS_PER_REQUEST,
  MAX_RAW_TEXT_DIFF_PAIRS_PER_REQUEST,
  MAX_REPLACEMENTS_PER_FILE,
  MAX_TOTAL_RAW_TEXT_REQUEST_CHARS,
});

/**
 * Canonical runtime and output ceilings enforced after schema validation has already accepted the
 * request shape.
 *
 * @remarks
 * Handlers use these family budgets to fail early with family-aware refusal messaging, while the
 * server shell still applies the final global response fuse. Callers may narrow scope but may not
 * override, disable, or raise any of these ceilings.
 */
/**
 * Final server-wide response cap applied by the global output fuse.
 *
 * @remarks
 * This ceiling is the last non-bypassable safety floor after every endpoint-specific guardrail has
 * already had the chance to fail earlier with family-aware refusal messaging.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, GLOBAL_RESPONSE_HARD_CAP_CHARS, "server response")`
 */
export const GLOBAL_RESPONSE_HARD_CAP_CHARS = 200_000;

/**
 * Family-specific response cap for direct file-read output.
 *
 * @remarks
 * Read-file endpoints use this ceiling to refuse projected or actual oversized line-numbered file
 * content before the global fuse becomes the only protection layer.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, READ_FILES_RESPONSE_CAP_CHARS, "line-numbered read response")`
 */
export const READ_FILES_RESPONSE_CAP_CHARS = 180_000;

/**
 * Family-specific response cap for regex-search output.
 *
 * @remarks
 * Regex endpoints keep a lower formatted-output ceiling because search results can grow rapidly
 * even when individual matches remain small.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, REGEX_SEARCH_RESPONSE_CAP_CHARS, "regex search response")`
 */
export const REGEX_SEARCH_RESPONSE_CAP_CHARS = 60_000;

/**
 * Maximum number of regex match locations that may be collected successfully.
 *
 * @remarks
 * This runtime ceiling stops high-density search results before result shaping turns one valid
 * query into an oversized response surface.
 *
 * @example
 * `assertRegexRuntimeBudget(toolName, collectedLocations, totalBytesScanned)`
 */
export const REGEX_SEARCH_MAX_RESULTS_HARD_CAP = 200;

/**
 * Maximum number of candidate bytes that regex runtime scanning may inspect.
 *
 * @remarks
 * Apply this ceiling during regex execution so legitimate broad roots still terminate safely when
 * the candidate surface becomes too large.
 *
 * @example
 * `assertRegexRuntimeBudget(toolName, collectedLocations, totalBytesScanned)`
 */
export const REGEX_SEARCH_MAX_CANDIDATE_BYTES = 8_388_608;

/**
 * Maximum length of one formatted regex match excerpt.
 *
 * @remarks
 * This ceiling keeps individual match snippets concise while preserving the matched text whenever
 * possible.
 *
 * @example
 * `const excerpt = line.slice(0, REGEX_SEARCH_EXCERPT_MAX_CHARS)`
 */
export const REGEX_SEARCH_EXCERPT_MAX_CHARS = 240;

/**
 * Family-specific response cap for discovery-style structured output.
 *
 * @remarks
 * Discovery endpoints can fan out across many filesystem entries, so they use a dedicated output
 * ceiling below the global fuse.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, DISCOVERY_RESPONSE_CAP_CHARS, "discovery response")`
 */
export const DISCOVERY_RESPONSE_CAP_CHARS = 80_000;

/**
 * Family-specific response cap for metadata and listing output.
 *
 * @remarks
 * Metadata-heavy endpoints usually return structured summaries rather than raw content, but still
 * need a dedicated output ceiling to control breadth.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, METADATA_RESPONSE_CAP_CHARS, "metadata response")`
 */
export const METADATA_RESPONSE_CAP_CHARS = 60_000;

/**
 * Family-specific response cap for file-backed diff output.
 *
 * @remarks
 * File-based diff endpoints can emit larger responses than raw-text diffs because their inputs are
 * constrained by file metadata rather than full caller-controlled text payloads.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, FILE_DIFF_RESPONSE_CAP_CHARS, "file diff response")`
 */
export const FILE_DIFF_RESPONSE_CAP_CHARS = 120_000;

/**
 * Family-specific response cap for in-memory raw-text diff output.
 *
 * @remarks
 * Raw-text diff endpoints use a stricter ceiling because callers directly control both diff inputs
 * and can amplify memory and response growth more aggressively.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, TEXT_DIFF_RESPONSE_CAP_CHARS, "raw-text diff response")`
 */
export const TEXT_DIFF_RESPONSE_CAP_CHARS = 80_000;

/**
 * Maximum formatted summary size for path-mutation success output.
 *
 * @remarks
 * Mutation endpoints should acknowledge work concisely and must not echo a broad destructive batch
 * back to the caller as a large content payload.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, PATH_MUTATION_SUMMARY_CAP_CHARS, "path mutation summary")`
 */
export const PATH_MUTATION_SUMMARY_CAP_CHARS = 40_000;

/**
 * Maximum aggregate raw-content input budget for content-bearing mutation requests.
 *
 * @remarks
 * This ceiling protects create and append workflows before writes begin by bounding the cumulative
 * text payload carried across all content items in one request.
 *
 * @example
 * `if (totalChars > CONTENT_MUTATION_TOTAL_INPUT_CHARS) rejectRequest()`
 */
export const CONTENT_MUTATION_TOTAL_INPUT_CHARS = 200_000;

/**
 * Maximum aggregate replacement-text input budget for one line-range replacement request.
 *
 * @remarks
 * This ceiling keeps multi-replacement operations inside a bounded text budget before preview and
 * diff shaping begin.
 *
 * @example
 * `if (totalReplacementChars > LINE_REPLACEMENT_TOTAL_INPUT_CHARS) rejectRequest()`
 */
export const LINE_REPLACEMENT_TOTAL_INPUT_CHARS = 200_000;

/**
 * Canonical runtime budgets grouped by endpoint family and server-shell enforcement surface.
 *
 * @remarks
 * Every family-specific runtime budget remains at or below the global hard cap so handlers can
 * fail early with family-aware refusal messaging while the server shell still enforces one final,
 * non-bypassable response fuse across the complete MCP tool surface.
 *
 * @example
 * `const readCap = ENDPOINT_FAMILY_GUARDRAIL_LIMITS.READ_FILES_RESPONSE_CAP_CHARS`
 */
export const ENDPOINT_FAMILY_GUARDRAIL_LIMITS = Object.freeze({
  GLOBAL_RESPONSE_HARD_CAP_CHARS,
  READ_FILES_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  REGEX_SEARCH_EXCERPT_MAX_CHARS,
  DISCOVERY_RESPONSE_CAP_CHARS,
  METADATA_RESPONSE_CAP_CHARS,
  FILE_DIFF_RESPONSE_CAP_CHARS,
  TEXT_DIFF_RESPONSE_CAP_CHARS,
  PATH_MUTATION_SUMMARY_CAP_CHARS,
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  LINE_REPLACEMENT_TOTAL_INPUT_CHARS,
});
