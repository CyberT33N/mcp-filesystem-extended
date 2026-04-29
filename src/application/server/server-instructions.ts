const SERVER_INSTRUCTION_LINES = [
  "- All multi-target tools accept arrays even when only one item is processed.",
  "- All path inputs must resolve inside allowed directories.",
  "- Traversal-oriented discovery and recursive inspection tools exclude default vendor/cache trees when callers provide broad roots.",
  "- Explicit roots inside excluded trees remain valid, and `includeExcludedGlobs` can reopen named descendants without broadening the full request scope.",
  "- `respectGitIgnore` is an additive opt-in that can layer root-local `.gitignore` exclusions on top of the default traversal policy.",
  "- Hard request and response safety caps are enforced server-side across all tool families.",
  "- Callers may narrow scope, but they cannot disable or override server-side hard caps.",
  "- Metadata-first admission control applies to file-read-style operations, and callers should switch to narrower ranges or cursor modes when inline full responses are not allowed.",
  "- Explicit large text-compatible file search may proceed after content-state eligibility succeeds, while broad recursive search and discovery workloads may still degrade into preview-first or completion-backed behavior under family guardrails; resume-bearing responses may use compact text guidance, while unsupported surfaces and recursive workloads that still exceed server-owned lane budgets continue to refuse.",
  "- When a tool returns additive `admission` and `resume` metadata, `structuredContent.admission` and `structuredContent.resume` remain authoritative.",
  "- Scope reduction remains a first-class alternative to resume: callers may narrow roots, choose deeper paths, tighten globs, tighten name filters, or constrain files with include globs when that is architecturally preferable.",
  "- For `list_directory_entries`, preview-first responses may also surface the current bounded directory-entry chunk and any active `resumeToken` in `content.text` so text-only consumers keep a usable same-endpoint continuation path while `structuredContent` remains authoritative.",
  "- A preview-first response may be finalized and non-resumable when the current bounded final payload is already present in `structuredContent`; do not infer missing payload or broken resume behavior from compact text alone.",
  "- Resume the same request on the same public endpoint by sending only `resumeToken` when `resume.resumable` is true and a non-null token is present; preview-capable families may choose `resumeMode = 'next-chunk'` or `resumeMode = 'complete-result'`, while `count_lines` supports only `resumeMode = 'complete-result'` and never exposes preview-style partial totals.",
  "- `completion-backed-required` means the server owns a bounded completion attempt, not a cap bypass; completion may still return a final complete result, a renewed resumable session, or additional narrowing guidance.",
  "- Invalid, expired, deleted, wrong-family, or otherwise unusable resume tokens collapse into one server-owned not-found-class resume failure instead of exposing token-state details.",
  "- Regex content search may refuse structurally unsafe patterns before runtime execution begins.",
  "- Use find_paths_by_name for file or directory name lookup, find_files_by_glob for glob matching, search_file_contents_by_regex for regex content search, search_file_contents_by_fixed_string for literal content search, and read_file_content for single-file content access.",
  "- replace_file_line_ranges uses 1-based inclusive line ranges and does not accept unified diff patch text.",
  "- Read-only tools are marked through annotations; destructive or state-changing tools are local-only and closed-world.",
  "- The global response fuse remains the final non-bypassable response safety floor after family-specific guardrails.",
  "- Preview-first and resume-bearing responses may summarize the bounded chunk in `content.text`, but callers must not infer resume truth from text alone.",
  "- When a tool exposes structuredContent, treat the structured object as the authoritative result shape.",
  "- Downstream consumers or adapters that expose only `content.text` while dropping `structuredContent` are outside this server-owned result contract and are responsible for any apparent resume-token or bounded-payload loss.",
  "- Six inspection endpoints participate in the resume architecture: list_directory_entries, find_paths_by_name, find_files_by_glob, search_file_contents_by_regex, search_file_contents_by_fixed_string, and count_lines. On these endpoints, query-defining fields such as roots, glob, nameContains, regex, fixedString, and paths appear as optional in the JSON Schema because the same endpoint serves both base requests and resume-only requests; the fields are semantically required for base requests and must be omitted on resume-only requests that supply a resumeToken.",
  "- When sending a base request to a resume-capable endpoint, always provide the required query-defining fields: roots for discovery tools, glob for find_files_by_glob, nameContains for find_paths_by_name, regex for search_file_contents_by_regex, fixedString for search_file_contents_by_fixed_string, and paths for count_lines. Omitting them on a base request produces a validation error.",
] as const;

/**
 * Stable server-level instruction text exposed during MCP initialization.
 *
 * @remarks
 * These lines summarize the caller-visible contract for the layered guardrail model. They steer
 * callers toward narrower requests, clarify that hard caps remain non-bypassable, and reinforce
 * that structured responses stay authoritative when a tool exposes both text and structured
 * surfaces.
 */
export const SERVER_INSTRUCTIONS = SERVER_INSTRUCTION_LINES.join("\n");
