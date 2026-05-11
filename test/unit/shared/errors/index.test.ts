import { describe, expect, it } from "vitest";

import * as sharedErrors from "@shared/errors";
import { isAbortError } from "@shared/errors/is-abort-error/abort-guard";
import { normalizeError } from "@shared/errors/normalize-error/normalize";

describe("shared_errors_barrel", () => {
  it("re-exports the shared abort and normalization helpers through the barrel surface", () => {
    expect(Object.keys(sharedErrors).sort()).toEqual([
      "isAbortError",
      "normalizeError",
    ]);
    expect(sharedErrors.isAbortError).toBe(isAbortError);
    expect(sharedErrors.normalizeError).toBe(normalizeError);
  });
});
