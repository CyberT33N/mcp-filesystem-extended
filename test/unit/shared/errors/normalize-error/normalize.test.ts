import { describe, expect, it } from "vitest";

import { normalizeError } from "@shared/errors/normalize-error/normalize";

describe("normalize_error", () => {
  it("preserves existing error instances without wrapping them", () => {
    const typeError = new TypeError("Invalid payload");

    expect(normalizeError(typeError)).toBe(typeError);
  });

  it("converts non-error values into deterministic error messages", () => {
    expect(normalizeError("failure").message).toBe("failure");
    expect(normalizeError({ beta: 2, alpha: 1 }).message).toBe(
      '{"alpha":1,"beta":2}',
    );
    expect(normalizeError(Symbol("cancelled")).message).toBe("cancelled");
    expect(normalizeError(1n).message).toBe("1");
    expect(normalizeError(null).message).toBe("Unknown error");
    expect(normalizeError(["unexpected"]).message).toBe("Unknown error");
  });

  it("falls back to the unserializable marker when a plain object cannot be serialized", () => {
    expect(normalizeError({ toJSON: () => undefined }).message).toBe(
      "[Unserializable error object]",
    );
  });

  it("falls back to the unknown marker for symbols without a description", () => {
    expect(normalizeError(Symbol()).message).toBe("Unknown error");
  });
});
