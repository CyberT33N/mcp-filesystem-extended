import { describe, expect, it } from "vitest";

import type { AbortErrorLike } from "@shared/errors/is-abort-error/contracts";
import { isAbortError } from "@shared/errors/is-abort-error/abort-guard";

describe("abort_guard", () => {
  it("accepts DOMException and Error abort surfaces described by the shared abort contract", () => {
    const domAbortError = new DOMException("Aborted", "AbortError");
    const typedAbortError: AbortErrorLike = Object.assign(new Error("Aborted"), {
      name: "AbortError" as const,
    });

    expect(isAbortError(domAbortError)).toBe(true);
    expect(isAbortError(typedAbortError)).toBe(true);
  });

  it("rejects non-abort error-like values", () => {
    expect(isAbortError(new Error("Ordinary failure"))).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});
