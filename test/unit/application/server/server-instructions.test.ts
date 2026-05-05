import { describe, expect, it } from "vitest";

import { SERVER_INSTRUCTIONS } from "@application/server/server-instructions";

describe("server-instructions", () => {
  it("exports newline-delimited instruction text with the expected caller guidance", () => {
    const instructionLines = SERVER_INSTRUCTIONS.split("\n");

    expect(instructionLines[0]).toBe(
      "- All multi-target tools accept arrays even when only one item is processed.",
    );
    expect(instructionLines).toContain(
      "- replace_file_line_ranges uses 1-based inclusive line ranges and does not accept unified diff patch text.",
    );
    expect(instructionLines).toContain(
      "- The global response fuse remains the final non-bypassable response safety floor after family-specific guardrails.",
    );
    expect(instructionLines[instructionLines.length - 1]).toBe(
      "- When sending a base request to a resume-capable endpoint, always provide the required query-defining fields: roots for discovery tools, glob for find_files_by_glob, nameContains for find_paths_by_name, regex for search_file_contents_by_regex, fixedString for search_file_contents_by_fixed_string, and paths for count_lines. Omitting them on a base request produces a validation error.",
    );
  });
});
