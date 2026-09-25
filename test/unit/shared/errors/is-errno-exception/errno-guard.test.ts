import { describe, expect, it } from "vitest";

import { isErrnoException } from "@shared/errors/is-errno-exception/errno-guard";

describe("errno_guard", () => {
  it("accepts error values carrying a string errno code", () => {
    const errnoError = Object.assign(new Error("missing"), { code: "ENOENT" as const });

    expect(isErrnoException(errnoError)).toBe(true);
  });

  it("rejects errors without a code, non-string codes, and non-error values", () => {
    expect(isErrnoException(new Error("ordinary failure"))).toBe(false);
    expect(isErrnoException(Object.assign(new Error("numeric"), { code: 42 }))).toBe(false);
    expect(isErrnoException({ code: "ENOENT" })).toBe(false);
    expect(isErrnoException("ENOENT")).toBe(false);
  });
});
