const SERVER_INSTRUCTION_LINES = [
  "- All multi-target tools accept arrays even when only one item is processed.",
  "- All path inputs must resolve inside allowed directories.",
  "- Traversal-oriented discovery and recursive inspection tools exclude default vendor/cache trees when callers provide broad roots.",
  "- Explicit roots inside excluded trees remain valid, and `includeExcludedGlobs` can reopen named descendants without broadening the full request scope.",
  "- `respectGitIgnore` is an additive opt-in that can layer root-local `.gitignore` exclusions on top of the default traversal policy.",
  "- Hard request and response safety caps are enforced server-side across all tool families.",
  "- Callers may narrow scope, but they cannot disable or override server-side hard caps.",
  "- Metadata-first admission control applies to file-read-style operations, and callers should switch to narrower ranges or cursor modes when inline full responses are not allowed.",
  "- Large valid text workloads may degrade into preview-first or task-backed behavior under family guardrails, while unsupported or over-hard-gap workloads still refuse.",
  "- When a tool returns additive `admission` and `continuation` metadata, resume the same request on the same public endpoint by sending only `continuationToken`; do not resend the original query-defining fields.",
  "- Invalid, expired, deleted, wrong-family, or otherwise unusable continuation tokens collapse into one server-owned not-found-class continuation failure instead of exposing token-state details.",
  "- Regex content search may refuse structurally unsafe patterns before runtime execution begins.",
  "- Use find_paths_by_name for file or directory name lookup, find_files_by_glob for glob matching, search_file_contents_by_regex for regex content search, search_file_contents_by_fixed_string for literal content search, and read_file_content for single-file content access.",
  "- replace_file_line_ranges uses 1-based inclusive line ranges and does not accept unified diff patch text.",
  "- Read-only tools are marked through annotations; destructive or state-changing tools are local-only and closed-world.",
  "- The global response fuse remains the final non-bypassable response safety floor after family-specific guardrails.",
  "- When a tool exposes structuredContent, treat the structured object as the authoritative result shape.",
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
