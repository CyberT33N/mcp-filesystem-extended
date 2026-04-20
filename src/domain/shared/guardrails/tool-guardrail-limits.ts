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
 * Default model context window used to calibrate portable MCP hardgap ceilings.
 *
 * @remarks
 * The MCP server cannot inspect live caller context occupancy, so hardgaps are calibrated against
 * one stable default model budget instead of a runtime-specific session snapshot. Orchestrators
 * still decide whether a concrete request is appropriate for the currently remaining context.
 */
export const DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS = 1_000_000;

/**
 * Shared byte-to-token approximation used when translating hardgap ceilings into prompt-budget
 * percentages.
 *
 * @remarks
 * This value is intentionally conservative and exists only for architectural calibration of
 * portable hard ceilings, not for live token accounting.
 */
export const GUARDRAIL_BYTES_PER_TOKEN_ASSUMPTION = 3;

/**
 * Approximate character budget implied by the default model context window.
 *
 * @remarks
 * This surface is used only for documenting why family ceilings are proportioned the way they are.
 * It is not a live-context measurement and must never be treated as one.
 */
export const DEFAULT_MODEL_CONTEXT_WINDOW_APPROX_CHARS =
  DEFAULT_MODEL_CONTEXT_WINDOW_TOKENS * GUARDRAIL_BYTES_PER_TOKEN_ASSUMPTION;

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
 * evaluated across the broader operation. The cap remains large enough for single-file creation or
 * append payloads in a one-million-token default environment, but still low enough to prevent one
 * caller-controlled field from monopolizing the full mutation request budget.
 *
 * @example
 * `z.string().max(RAW_CONTENT_MAX_CHARS)`
 */
export const RAW_CONTENT_MAX_CHARS = 150_000;

/**
 * Maximum length for one canonical `replacementText` payload.
 *
 * @remarks
 * This constant preserves the single same-concept limit surface for line-range replacement text
 * and must remain aligned with the canonical `replacementText` property name. The cap is lower than
 * the raw-content ceiling because line-range replacement should stay targeted even when large
 * contiguous blocks are being replaced.
 *
 * @example
 * `z.string().max(REPLACEMENT_TEXT_MAX_CHARS)`
 */
export const REPLACEMENT_TEXT_MAX_CHARS = 100_000;

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
 * Maximum number of discovery results a caller may request before formatted response budgeting
 * becomes the dominant guardrail.
 *
 * @remarks
 * Path-only discovery surfaces are semantically lighter than full reads and regex snippets, so the
 * request cap can be broader. The limit still remains bounded because path enumeration beyond this
 * range usually creates orchestration noise instead of additional prompting value.
 *
 * @example
 * `z.number().max(DISCOVERY_MAX_RESULTS_HARD_CAP)`
 */
export const DISCOVERY_MAX_RESULTS_HARD_CAP = 1_000;

/**
 * Canonical per-window byte budget for bounded inspection content-state sampling.
 *
 * @remarks
 * The shared inspection-state classifier samples bounded head, middle, and tail windows instead of
 * relying on one local first-window probe. This constant is the single source of truth for one
 * sampling window budget across the shared state contract and its compatibility bridge.
 *
 * @example
 * `Buffer.alloc(INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES)`
 */
export const INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES = 4_096;

/**
 * Canonical sample-window positions used by bounded inspection content-state sampling.
 *
 * @remarks
 * The shared classifier uses one bounded head, middle, and tail sampling model so large ambiguous
 * surfaces never collapse back into a first-window-only heuristic.
 */
export const INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS = [
  "head",
  "middle",
  "tail",
] as const;

/**
 * Minimum file size treated as a large surface under the bounded inspection-state sampling model.
 *
 * @remarks
 * Surfaces above the total three-window sample capacity can no longer be treated as wholly
 * observed from bounded evidence alone, so ambiguous classification must stay conservative.
 *
 * @example
 * `if (candidateFileBytes >= INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES) { ... }`
 */
export const INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES =
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES
  * INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS.length
  + 1;

/**
 * Maximum aggregate raw-text input budget across one request.
 *
 * @remarks
 * Apply this ceiling after per-field text caps so multi-item requests cannot combine many locally
 * valid content fields into one oversized raw-text workload. The ceiling is deliberately larger
 * than a single per-field payload because legitimate multi-pair and multi-file operations should be
 * able to batch work inside a fresh one-million-token context window without forced micro-splitting.
 *
 * @example
 * `if (totalChars > MAX_TOTAL_RAW_TEXT_REQUEST_CHARS) rejectRequest()`
 */
export const MAX_TOTAL_RAW_TEXT_REQUEST_CHARS = 400_000;

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
  DISCOVERY_MAX_RESULTS_HARD_CAP,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_BYTES,
  INSPECTION_CONTENT_STATE_SAMPLE_WINDOW_POSITIONS,
  INSPECTION_CONTENT_STATE_UNKNOWN_LARGE_SURFACE_MIN_BYTES,
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
 * already had the chance to fail earlier with family-aware refusal messaging. At 600,000
 * characters, the fuse represents roughly twenty percent of the default 1,000,000-token context
 * window using the shared three-bytes-per-token assumption. This keeps the server-level fallback
 * broad enough for legitimate large outputs while still stopping pathological responses.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, GLOBAL_RESPONSE_HARD_CAP_CHARS, "server response")`
 */
export const GLOBAL_RESPONSE_HARD_CAP_CHARS = 600_000;

/**
 * Family-specific response cap for direct file-read output.
 *
 * @remarks
 * Read-file endpoints use this ceiling to refuse projected or actual oversized line-numbered file
 * content before the global fuse becomes the only protection layer. Direct file reads receive the
 * largest family budget because forcing an agent to split one legitimate multi-file read into many
 * sequential retries increases reasoning churn, repeated orchestration cost, and context-drift
 * risk. At 450,000 characters, this ceiling represents roughly fifteen percent of the default
 * one-million-token context window.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, READ_FILES_RESPONSE_CAP_CHARS, "line-numbered read response")`
 */
export const READ_FILES_RESPONSE_CAP_CHARS = 450_000;

/**
 * Family-specific response cap for inline single-file content reads.
 *
 * @remarks
 * The dedicated `read_file_content` endpoint shares the direct-read response family whenever it
 * returns inline full, line-range, or byte-range content. Mode-specific thresholds still decide
 * whether an inline response is allowed at all, but successful inline payloads remain governed by
 * the same caller-context envelope as the canonical direct-read family.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, READ_FILE_CONTENT_RESPONSE_CAP_CHARS, "inline content-read response")`
 */
export const READ_FILE_CONTENT_RESPONSE_CAP_CHARS = READ_FILES_RESPONSE_CAP_CHARS;

/**
 * Family-specific response cap for regex-search output.
 *
 * @remarks
 * Regex endpoints keep a lower formatted-output ceiling because search results can grow rapidly
 * even when individual matches remain small. Search snippets are semantically sparser than full
 * reads, so the output ceiling stays lower to encourage narrowing before the caller spends a large
 * portion of context on repetitive match listings.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, REGEX_SEARCH_RESPONSE_CAP_CHARS, "regex search response")`
 */
export const REGEX_SEARCH_RESPONSE_CAP_CHARS = 120_000;

/**
 * Family-specific response cap for fixed-string search output.
 *
 * @remarks
 * The fixed-string endpoint stays inside the same successful-response envelope as regex search
 * even when its runtime scan presets are tuned more generously for literal search. This keeps one
 * shared caller-facing search response budget while allowing backend-specific runtime policy to
 * differentiate scan cost before a successful response is shaped.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS, "fixed-string search response")`
 */
export const FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS = REGEX_SEARCH_RESPONSE_CAP_CHARS;

/**
 * Maximum number of regex match locations that may be collected successfully.
 *
 * @remarks
 * This runtime ceiling stops high-density search results before result shaping turns one valid
 * query into an oversized response surface. The value is intentionally lower than discovery-style
 * path enumeration because regex results carry per-match line context and therefore consume more
 * prompt budget per returned item.
 *
 * @example
 * `assertRegexRuntimeBudget(toolName, collectedLocations, totalBytesScanned)`
 */
export const REGEX_SEARCH_MAX_RESULTS_HARD_CAP = 400;

/**
 * Maximum number of candidate bytes that regex runtime scanning may inspect.
 *
 * @remarks
 * Apply this ceiling during regex execution so legitimate broad roots still terminate safely when
 * the candidate surface becomes too large. Candidate-byte scanning is a server-side CPU and I/O
 * hardgap rather than a caller-context hardgap, so it can be materially broader than the final
 * response cap without increasing model-context pressure directly.
 *
 * @example
 * `assertRegexRuntimeBudget(toolName, collectedLocations, totalBytesScanned)`
 */
export const REGEX_SEARCH_MAX_CANDIDATE_BYTES = 33_554_432;

/**
 * Maximum length of one formatted regex match excerpt.
 *
 * @remarks
 * This ceiling keeps individual match snippets concise while preserving the matched text whenever
 * possible. The slightly larger excerpt budget improves local reasoning quality for regex hits
 * without turning one match into a mini full-file read.
 *
 * @example
 * `const excerpt = line.slice(0, REGEX_SEARCH_EXCERPT_MAX_CHARS)`
 */
export const REGEX_SEARCH_EXCERPT_MAX_CHARS = 320;

/**
 * Family-specific response cap for discovery-style structured output.
 *
 * @remarks
 * Discovery endpoints can fan out across many filesystem entries, so they use a dedicated output
 * ceiling below the global fuse. Discovery output is cheaper than full reads but still lower value
 * per character than canonical file content, so the ceiling stays meaningfully below the direct
 * read family while remaining broad enough for legitimate batched path exploration.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, DISCOVERY_RESPONSE_CAP_CHARS, "discovery response")`
 */
export const DISCOVERY_RESPONSE_CAP_CHARS = 150_000;

/**
 * Family-specific response cap for metadata and listing output.
 *
 * @remarks
 * Metadata-heavy endpoints usually return structured summaries rather than raw content, but still
 * need a dedicated output ceiling to control breadth. The ceiling remains below discovery output
 * because metadata surfaces often repeat similar keys and therefore deliver less incremental
 * reasoning value per character than direct content reads.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, METADATA_RESPONSE_CAP_CHARS, "metadata response")`
 */
export const METADATA_RESPONSE_CAP_CHARS = 100_000;

/**
 * Family-specific response cap for structured `count_lines` output.
 *
 * @remarks
 * The modernized `count_lines` endpoint may stream or query large files internally, but its public
 * result surface remains a compact structured summary. The count family therefore stays aligned to
 * the metadata-style response envelope rather than borrowing the larger direct-read family cap.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, COUNT_LINES_RESPONSE_CAP_CHARS, "count-lines response")`
 */
export const COUNT_LINES_RESPONSE_CAP_CHARS = METADATA_RESPONSE_CAP_CHARS;

/**
 * Family-specific response cap for file-backed diff output.
 *
 * @remarks
 * File-based diff endpoints can emit larger responses than raw-text diffs because their inputs are
 * constrained by file metadata rather than full caller-controlled text payloads. File-backed diffs
 * therefore receive a higher cap than raw-text diffs because they more often support legitimate
 * repository review workflows rather than arbitrary caller-injected payload expansion.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, FILE_DIFF_RESPONSE_CAP_CHARS, "file diff response")`
 */
export const FILE_DIFF_RESPONSE_CAP_CHARS = 300_000;

/**
 * Family-specific response cap for in-memory raw-text diff output.
 *
 * @remarks
 * Raw-text diff endpoints use a stricter ceiling because callers directly control both diff inputs
 * and can amplify memory and response growth more aggressively. The ceiling is still materially
 * larger than the previous baseline so callers can compare substantial in-memory artifacts without
 * being forced into unnecessary multi-step orchestration.
 *
 * @example
 * `assertProjectedTextBudget(toolName, projectedChars, TEXT_DIFF_RESPONSE_CAP_CHARS, "raw-text diff response")`
 */
export const TEXT_DIFF_RESPONSE_CAP_CHARS = 240_000;

/**
 * Maximum formatted summary size for path-mutation success output.
 *
 * @remarks
 * Mutation endpoints should acknowledge work concisely and must not echo a broad destructive batch
 * back to the caller as a large content payload. The ceiling is intentionally modest because path
 * mutation summaries are low-density confirmation surfaces, not primary reasoning context.
 *
 * @example
 * `assertActualTextBudget(toolName, actualChars, PATH_MUTATION_SUMMARY_CAP_CHARS, "path mutation summary")`
 */
export const PATH_MUTATION_SUMMARY_CAP_CHARS = 60_000;

/**
 * Maximum aggregate raw-content input budget for content-bearing mutation requests.
 *
 * @remarks
 * This ceiling protects create and append workflows before writes begin by bounding the cumulative
 * text payload carried across all content items in one request. The cap is large enough for a
 * handful of substantial file-creation operations in a fresh one-million-token environment, while
 * still preventing a single request from collapsing into an unbounded write surface.
 *
 * @example
 * `if (totalChars > CONTENT_MUTATION_TOTAL_INPUT_CHARS) rejectRequest()`
 */
export const CONTENT_MUTATION_TOTAL_INPUT_CHARS = 400_000;

/**
 * Maximum aggregate replacement-text input budget for one line-range replacement request.
 *
 * @remarks
 * This ceiling keeps multi-replacement operations inside a bounded text budget before preview and
 * diff shaping begin. It remains below the broader content-mutation ceiling because line-range
 * replacement should preserve targeted edit semantics rather than acting as a disguised full-file
 * write surface.
 *
 * @example
 * `if (totalReplacementChars > LINE_REPLACEMENT_TOTAL_INPUT_CHARS) rejectRequest()`
 */
export const LINE_REPLACEMENT_TOTAL_INPUT_CHARS = 300_000;

/**
 * Maximum number of filesystem entries that one shared traversal-scope preflight probe may inspect
 * before the server rejects the traversal root as too broad for immediate recursive execution.
 *
 * @remarks
 * This ceiling belongs to the metadata-first admission layer and exists specifically to make
 * server-side scope governance visible before recursive consumers enter their full traversal loop.
 * The budget stays materially below the deeper runtime traversal ceiling so broad-root refusals can
 * fail early as preflight decisions instead of surfacing first as runtime-budget exhaustion.
 *
 * @example
 * `assertTraversalScopePreflightBudget(toolName, requestedRoot, state)`
 */
export const TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES = 25_000;

/**
 * Maximum number of directories that one shared traversal-scope preflight probe may inspect
 * before the server rejects the traversal root as too broad for immediate recursive execution.
 *
 * @remarks
 * The preflight directory ceiling is intentionally lower than the deeper runtime traversal budget so
 * wide recursive directory trees can be rejected up front with narrowing guidance rather than first
 * surfacing as timeout-shaped runtime failures.
 *
 * @example
 * `assertTraversalScopePreflightBudget(toolName, requestedRoot, state)`
 */
export const TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES = 2_500;

/**
 * Soft wall-clock runtime budget for one shared traversal-scope preflight probe.
 *
 * @remarks
 * This budget constrains only the early server-side admission probe, not the deeper guarded
 * traversal itself. Keeping the probe budget materially below the later runtime safeguard preserves
 * preflight-first refusal semantics for broad invalid traversal roots.
 *
 * @example
 * `assertTraversalScopePreflightBudget(toolName, requestedRoot, state)`
 */
export const TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS = 750;

/**
 * Maximum number of filesystem entries that one guarded traversal may visit before the shared
 * runtime-budget layer must refuse further fan-out.
 *
 * @remarks
 * This ceiling is tuned for high-scale local traversal while still failing deterministically before
 * broad-root directory walks collapse into environment timeouts.
 *
 * @example
 * `assertTraversalRuntimeBudget(toolName, state)`
 */
export const TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES = 250_000;

/**
 * Maximum number of directories that one guarded traversal may descend into before the shared
 * runtime-budget layer must refuse further traversal.
 *
 * @remarks
 * The directory ceiling stays intentionally lower than the entry ceiling so wide fan-out across
 * nested directory trees can fail deterministically before downstream endpoint work explodes.
 *
 * @example
 * `assertTraversalRuntimeBudget(toolName, state)`
 */
export const TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES = 25_000;

/**
 * Soft wall-clock runtime budget for one guarded traversal before deterministic refusal takes over.
 *
 * @remarks
 * This soft budget exists as a deeper emergency safeguard after server-side preflight and
 * traversal-scope handling have already admitted the workload. The limit remains high enough for
 * legitimate large local inspection while still protecting the shared guardrail model from
 * timeout-shaped behavior.
 *
 * @example
 * `assertTraversalRuntimeBudget(toolName, state)`
 */
export const TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS = 5_000;

/**
 * Canonical runtime budgets grouped by endpoint family and server-shell enforcement surface.
 *
 * @remarks
 * Every family-specific runtime budget remains at or below the global hard cap so handlers can
 * fail early with family-aware refusal messaging while the server shell still enforces one final,
 * non-bypassable response fuse across the complete MCP tool surface. Traversal budgets operate as
 * deeper safeguards after root-level preflight admission instead of acting as the primary
 * caller-facing contract surface.
 *
 * @example
 * `const readCap = ENDPOINT_FAMILY_GUARDRAIL_LIMITS.READ_FILES_RESPONSE_CAP_CHARS`
 */
export const ENDPOINT_FAMILY_GUARDRAIL_LIMITS = Object.freeze({
  GLOBAL_RESPONSE_HARD_CAP_CHARS,
  READ_FILES_RESPONSE_CAP_CHARS,
  READ_FILE_CONTENT_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
  FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  REGEX_SEARCH_EXCERPT_MAX_CHARS,
  DISCOVERY_RESPONSE_CAP_CHARS,
  METADATA_RESPONSE_CAP_CHARS,
  COUNT_LINES_RESPONSE_CAP_CHARS,
  FILE_DIFF_RESPONSE_CAP_CHARS,
  TEXT_DIFF_RESPONSE_CAP_CHARS,
  PATH_MUTATION_SUMMARY_CAP_CHARS,
  CONTENT_MUTATION_TOTAL_INPUT_CHARS,
  LINE_REPLACEMENT_TOTAL_INPUT_CHARS,
  TRAVERSAL_PREFLIGHT_MAX_VISITED_ENTRIES,
  TRAVERSAL_PREFLIGHT_MAX_VISITED_DIRECTORIES,
  TRAVERSAL_PREFLIGHT_SOFT_TIME_BUDGET_MS,
  TRAVERSAL_RUNTIME_MAX_VISITED_ENTRIES,
  TRAVERSAL_RUNTIME_MAX_VISITED_DIRECTORIES,
  TRAVERSAL_RUNTIME_SOFT_TIME_BUDGET_MS,
});
