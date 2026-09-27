import { describe, expect, it } from "vitest";

import {
  assertRegexRuntimeBudget,
  compileGuardrailedSearchRegex,
  createGuardrailedSearchRegexExecutionPlan,
  createRegexBackendDialectRejectedError,
  isRegexSearchPatternContractError,
  normalizeRegexMatchExcerpt,
  resetRegexLastIndex,
} from "@domain/shared/guardrails/regex-search-safety";
import {
  REGEX_PATTERN_MAX_CHARS,
  REGEX_SEARCH_EXCERPT_MAX_CHARS,
  REGEX_SEARCH_MAX_CANDIDATE_BYTES,
  REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
} from "@domain/shared/guardrails/tool-guardrail-limits";
import { PATTERN_CLASSIFICATION_LITERALS } from "@domain/shared/search/pattern-classifier";

describe("regex search safety", () => {
  it("creates a guardrailed execution plan for content-bearing regex patterns", () => {
    const plan = createGuardrailedSearchRegexExecutionPlan(
      "search_file_contents_by_regex",
      "preview-.*-mode",
      false,
    );

    expect(plan.patternClassification.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.automatonSafeRegex,
    );
    expect(plan.regex.flags).toBe("gim");
    expect(plan.regex.source).toBe("preview-.*-mode");
  });

  it("compiles case-sensitive regex patterns without the ignore-case flag", () => {
    const regex = compileGuardrailedSearchRegex(
      "search_file_contents_by_regex",
      "preview-.*-mode",
      true,
    );

    expect(regex.flags).toBe("gm");
  });

  it("rejects invalid or zero-length regex content-match patterns", () => {
    expect(() =>
      createGuardrailedSearchRegexExecutionPlan(
        "search_file_contents_by_regex",
        "(",
        false,
      ),
    ).toThrow("Invalid regular expression syntax");

    expect(() =>
      compileGuardrailedSearchRegex(
        "search_file_contents_by_regex",
        "^",
        false,
      ),
    ).toThrow("zero-length match");
  });

  it("creates canonical backend-dialect rejection errors that remain pattern-contract failures", () => {
    const error = createRegexBackendDialectRejectedError(
      "search_file_contents_by_regex",
      "(?<=preview-)mode",
      false,
      "PCRE2 lookbehind is not supported in the selected lane.",
    );

    expect(isRegexSearchPatternContractError(error)).toBe(true);
    expect(error.message).toContain(
      "Native regex backend rejected the pattern for the selected execution lane",
    );
  });

  it("normalizes long regex excerpts around the matched text and resets regex lastIndex between uses", () => {
    const regex = /mode/giu;

    regex.exec("preview-mode");
    expect(regex.lastIndex).toBeGreaterThan(0);

    resetRegexLastIndex(regex);
    expect(regex.lastIndex).toBe(0);

    const line = `${"a".repeat(240)}match-text${"b".repeat(240)}`;
    const excerpt = normalizeRegexMatchExcerpt(line, "match-text");

    expect(excerpt.length).toBeLessThanOrEqual(
      REGEX_SEARCH_EXCERPT_MAX_CHARS,
    );
    expect(excerpt).toContain("match-text");
  });

  it("enforces regex runtime result and candidate-byte budgets", () => {
    expect(() =>
      assertRegexRuntimeBudget(
        "search_file_contents_by_regex",
        REGEX_SEARCH_MAX_RESULTS_HARD_CAP,
        REGEX_SEARCH_MAX_CANDIDATE_BYTES,
      ),
    ).not.toThrow();

    expect(() =>
      assertRegexRuntimeBudget(
        "search_file_contents_by_regex",
        REGEX_SEARCH_MAX_RESULTS_HARD_CAP + 1,
        0,
      ),
    ).toThrow("regex match locations collected");

    expect(() =>
      assertRegexRuntimeBudget(
        "search_file_contents_by_regex",
        0,
        REGEX_SEARCH_MAX_CANDIDATE_BYTES + 1,
      ),
    ).toThrow("regex candidate bytes scanned");
  });

  it("rejects empty regex patterns before compilation", () => {
    expect(() =>
      createGuardrailedSearchRegexExecutionPlan(
        "search_file_contents_by_regex",
        "",
        false,
      ),
    ).toThrow("Empty regex patterns do not produce content-bearing matches");
  });

  it("truncates long pattern summaries in backend-dialect rejection errors", () => {
    const longPattern = `(${"a".repeat(REGEX_PATTERN_MAX_CHARS)})`;

    const error = createRegexBackendDialectRejectedError(
      "search_file_contents_by_regex",
      longPattern,
      false,
      "lane rejected the pattern",
    );

    expect(error.message).toContain("…");
    expect(error.message).not.toContain(longPattern);
  });

  it("bounds regex excerpts for empty, missing, oversized, and tail-side matches", () => {
    const longLine = "a".repeat(REGEX_SEARCH_EXCERPT_MAX_CHARS + 100);

    const emptyMatchExcerpt = normalizeRegexMatchExcerpt(longLine, "");
    expect(emptyMatchExcerpt.length).toBe(REGEX_SEARCH_EXCERPT_MAX_CHARS);

    const missingMatchExcerpt = normalizeRegexMatchExcerpt(longLine, "zzz");
    expect(missingMatchExcerpt).toBe(longLine.slice(0, REGEX_SEARCH_EXCERPT_MAX_CHARS));

    const oversizedMatch = "m".repeat(REGEX_SEARCH_EXCERPT_MAX_CHARS + 50);
    const lineWithOversizedMatch = `prefix-${oversizedMatch}-suffix`;
    const oversizedExcerpt = normalizeRegexMatchExcerpt(
      lineWithOversizedMatch,
      oversizedMatch,
    );
    expect(oversizedExcerpt).toBe(oversizedMatch.slice(0, REGEX_SEARCH_EXCERPT_MAX_CHARS));

    const tailLine = `${"a".repeat(400)}needle`;
    const tailExcerpt = normalizeRegexMatchExcerpt(tailLine, "needle");
    expect(tailExcerpt).toContain("needle");
    expect(tailExcerpt.length).toBeLessThanOrEqual(REGEX_SEARCH_EXCERPT_MAX_CHARS);
  });

  it("returns short lines unchanged without windowing", () => {
    expect(normalizeRegexMatchExcerpt("short line", "short")).toBe("short line");
  });
});
