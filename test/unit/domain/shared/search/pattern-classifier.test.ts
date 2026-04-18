import { describe, expect, it } from "vitest";

import {
  classifyPattern,
  PATTERN_CLASSIFICATION_LITERALS,
} from "@domain/shared/search/pattern-classifier";

describe("classifyPattern", () => {
  it("classifies plain text as the literal fast path", () => {
    const result = classifyPattern("preview-first");

    expect(result.classification).toBe(PATTERN_CLASSIFICATION_LITERALS.literal);
    expect(result.requiresPcre2).toBe(false);
    expect(result.supportsLiteralFastPath).toBe(true);
    expect(result.originalPattern).toBe("preview-first");
  });

  it("classifies ordinary regex syntax as automaton-safe regex", () => {
    const result = classifyPattern("preview-.*-mode");

    expect(result.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.automatonSafeRegex,
    );
    expect(result.requiresPcre2).toBe(false);
    expect(result.supportsLiteralFastPath).toBe(false);
  });

  it("classifies lookbehind patterns as PCRE2-heavy regex", () => {
    const result = classifyPattern("(?<=preview-)mode");

    expect(result.classification).toBe(
      PATTERN_CLASSIFICATION_LITERALS.pcre2HeavyRegex,
    );
    expect(result.requiresPcre2).toBe(true);
    expect(result.supportsLiteralFastPath).toBe(false);
  });
});
