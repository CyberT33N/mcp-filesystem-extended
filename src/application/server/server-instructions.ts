const SERVER_INSTRUCTION_LINES = [
  "- All multi-target tools accept arrays even when only one item is processed.",
  "- All path inputs must resolve inside allowed directories.",
  "- Use find_paths_by_name for file or directory name lookup, find_files_by_glob for glob matching, and search_file_contents_by_regex for content search.",
  "- replace_file_line_ranges uses 1-based inclusive line ranges and does not accept unified diff patch text.",
  "- Read-only tools are marked through annotations; destructive or state-changing tools are local-only and closed-world.",
  "- When a tool exposes structuredContent, treat the structured object as the authoritative result shape.",
] as const;

/**
 * Stable server-level instruction text exposed during MCP initialization.
 */
export const SERVER_INSTRUCTIONS = SERVER_INSTRUCTION_LINES.join("\n");
