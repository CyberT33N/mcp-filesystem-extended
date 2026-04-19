import { describe, expect, it } from "vitest";

import {
  ReadFileContentArgsSchema,
  READ_FILE_CONTENT_TOOL_NAME,
  normalizeReadFileContentArgs,
} from "@domain/inspection/read-file-content/schema";
import {
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
} from "@domain/shared/runtime/io-capability-profile";
import {
  ENDPOINT_FAMILY_GUARDRAIL_LIMITS,
  FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS,
  METADATA_RESPONSE_CAP_CHARS,
  READ_FILE_CONTENT_RESPONSE_CAP_CHARS,
  READ_FILES_RESPONSE_CAP_CHARS,
  REGEX_SEARCH_RESPONSE_CAP_CHARS,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { resolveSearchExecutionPolicy } from "@domain/shared/search/search-execution-policy";
import { SERVER_INSTRUCTIONS } from "@application/server/server-instructions";

describe("large-text search regression contract", () => {
  it("keeps preview-first and task-backed semantics visible in the shared server instructions", () => {
    expect(SERVER_INSTRUCTIONS).toContain(
      "Large valid text workloads may degrade into preview-first or task-backed behavior under family guardrails, while unsupported or over-hard-gap workloads still refuse.",
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "search_file_contents_by_fixed_string",
    );
    expect(SERVER_INSTRUCTIONS).toContain("read_file_content");
    expect(SERVER_INSTRUCTIONS).toContain("count_lines");
  });

  it("keeps the shared runtime policy thresholds stable for conservative environments", () => {
    const policy = resolveSearchExecutionPolicy(
      DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
    );

    expect(policy.runtimeConfidenceTier).toBe(RuntimeConfidenceTier.UNKNOWN);
    expect(policy.previewFirstResponseCapFraction).toBe(0.5);
    expect(policy.syncComfortWindowSeconds).toBe(15);
    expect(policy.taskRecommendedAfterSeconds).toBe(60);
  });

  it("preserves the family guardrail relationships for direct reads, literal search, and count-lines", () => {
    expect(READ_FILE_CONTENT_RESPONSE_CAP_CHARS).toBe(
      READ_FILES_RESPONSE_CAP_CHARS,
    );
    expect(FIXED_STRING_SEARCH_RESPONSE_CAP_CHARS).toBe(
      REGEX_SEARCH_RESPONSE_CAP_CHARS,
    );
    expect(ENDPOINT_FAMILY_GUARDRAIL_LIMITS.COUNT_LINES_RESPONSE_CAP_CHARS).toBe(
      METADATA_RESPONSE_CAP_CHARS,
    );
  });

  it("keeps the public read_file_content endpoint name and explicit mode contract stable", () => {
    expect(READ_FILE_CONTENT_TOOL_NAME).toBe("read_file_content");

    expect(
      ReadFileContentArgsSchema.safeParse({
        mode: "full",
        path: "docs/notes.txt",
      }).success,
    ).toBe(true);

    expect(
      ReadFileContentArgsSchema.safeParse({
        line_range: {
          end: 34,
          start: 10,
        },
        mode: "line-range",
        path: "docs/notes.txt",
      }).success,
    ).toBe(true);

    expect(
      normalizeReadFileContentArgs(
        ReadFileContentArgsSchema.parse({
          line_range: {
            end: 34,
            start: 10,
          },
          mode: "line-range",
          path: "docs/notes.txt",
        }),
      ),
    ).toEqual({
      lineCount: 25,
      mode: "line_range",
      path: "docs/notes.txt",
      startLine: 10,
    });

    expect(
      ReadFileContentArgsSchema.safeParse({
        byte_range: {
          byteCount: 1024,
          start: 0,
        },
        mode: "byte-range",
        path: "docs/notes.txt",
      }).success,
    ).toBe(true);

    expect(
      ReadFileContentArgsSchema.safeParse({
        chunk_cursor: {
          byteCount: 2048,
          cursor: null,
        },
        mode: "chunk-cursor",
        path: "docs/notes.txt",
      }).success,
    ).toBe(true);
  });
});
