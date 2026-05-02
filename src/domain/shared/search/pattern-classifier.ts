/**
 * Declares the shared pattern-classification vocabulary for native-search execution.
 *
 * @remarks
 * Later regex search, fixed-string search, and pattern-aware counting must consume this
 * surface instead of inventing endpoint-local pattern classes or backend-routing rules.
 */
export const PATTERN_CLASSIFICATION_LITERALS = {
  automatonSafeRegex: "automaton_safe_regex",
  literal: "literal",
  pcre2HeavyRegex: "pcre2_heavy_regex",
} as const;

/**
 * Shared execution classes for search-pattern routing.
 */
export type PatternClassificationKind =
  (typeof PATTERN_CLASSIFICATION_LITERALS)[keyof typeof PATTERN_CLASSIFICATION_LITERALS];

/**
 * Canonical structured result for one caller-supplied search pattern.
 */
export interface PatternClassification {
  /**
   * Original pattern string supplied by the caller.
   */
  originalPattern: string;

  /**
   * Normalized execution class that later policy routing consumes.
   */
  classification: PatternClassificationKind;

  /**
   * Indicates whether the pattern needs a PCRE2-capable execution lane.
   */
  requiresPcre2: boolean;

  /**
   * Indicates whether the pattern may safely use the fixed-string fast path.
   */
  supportsLiteralFastPath: boolean;
}

const PCRE2_HEAVY_PATTERN_MATCHERS = [
  /\(\?=/,
  /\(\?!/,
  /\(\?<=/,
  /\(\?<!/,
  /\(\?>/,
  /\(\*[A-Z_]+/i,
  /\\[1-9]/,
  /\\k</,
  /\(\?\(/,
  /\(\?R\)/,
  /\(\?0\)/,
  /\+\+|\*\+|\?\+|\{\d+(?:,\d*)?\}\+/,
];

const REGEX_META_CHARACTERS = new Set([
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ".",
  "*",
  "+",
  "?",
  "^",
  "$",
  "|",
]);

function requiresPcre2Engine(pattern: string): boolean {
  return PCRE2_HEAVY_PATTERN_MATCHERS.some((matcher) => matcher.test(pattern));
}

function hasRegexSemantics(pattern: string): boolean {
  let escaped = false;

  for (const character of pattern) {
    if (escaped) {
      return true;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (REGEX_META_CHARACTERS.has(character)) {
      return true;
    }
  }

  return false;
}

/**
 * Classifies one search pattern into the shared native-search routing vocabulary.
 *
 * @param pattern - Raw caller-supplied search pattern.
 * @returns Structured classification output for later command and policy routing.
 */
export function classifyPattern(pattern: string): PatternClassification {
  if (requiresPcre2Engine(pattern)) {
    return {
      classification: PATTERN_CLASSIFICATION_LITERALS.pcre2HeavyRegex,
      originalPattern: pattern,
      requiresPcre2: true,
      supportsLiteralFastPath: false,
    };
  }

  if (hasRegexSemantics(pattern)) {
    return {
      classification: PATTERN_CLASSIFICATION_LITERALS.automatonSafeRegex,
      originalPattern: pattern,
      requiresPcre2: false,
      supportsLiteralFastPath: false,
    };
  }

  return {
    classification: PATTERN_CLASSIFICATION_LITERALS.literal,
    originalPattern: pattern,
    requiresPcre2: false,
    supportsLiteralFastPath: true,
  };
}
