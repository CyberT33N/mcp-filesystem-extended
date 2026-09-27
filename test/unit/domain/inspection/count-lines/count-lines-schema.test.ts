import { describe, expect, it } from "vitest";

import { CountLinesArgsSchema } from "@domain/inspection/count-lines/schema";

describe("count_lines schema", () => {
  it("accepts a minimal base request with one count scope path", () => {
    const parsed = CountLinesArgsSchema.parse({ paths: ["src"] });

    expect(parsed.paths).toEqual(["src"]);
    expect(parsed.recursive).toBe(false);
    expect(parsed.ignoreEmptyLines).toBe(false);
  });

  it("rejects base requests without any count scope path", () => {
    expect(() => CountLinesArgsSchema.parse({})).toThrow(
      "Base requests must provide at least one count scope path.",
    );
  });

  it("accepts resume-only requests with a token and the completion-backed mode", () => {
    const parsed = CountLinesArgsSchema.parse({
      resumeMode: "complete-result",
      resumeToken: "token-1",
    });

    expect(parsed.resumeToken).toBe("token-1");
    expect(parsed.resumeMode).toBe("complete-result");
  });

  it("rejects resume requests that still carry query-defining fields", () => {
    expect(() =>
      CountLinesArgsSchema.parse({
        paths: ["src"],
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        recursive: true,
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        regex: "TODO",
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        includeGlobs: ["**/*.ts"],
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        excludeGlobs: ["**/dist/**"],
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        respectGitIgnore: true,
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        includeExcludedGlobs: ["**/node_modules/example/**"],
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
    expect(() =>
      CountLinesArgsSchema.parse({
        ignoreEmptyLines: true,
        resumeMode: "complete-result",
        resumeToken: "token-1",
      })
    ).toThrow("must omit new query-defining fields");
  });

  it("rejects base requests that carry a resume mode without a token", () => {
    expect(() =>
      CountLinesArgsSchema.parse({
        paths: ["src"],
        resumeMode: "complete-result",
      })
    ).toThrow("must not provide a resume mode without a resume token");
  });

  it("rejects resume requests without a resume mode", () => {
    expect(() => CountLinesArgsSchema.parse({ resumeToken: "token-1" })).toThrow(
      "must provide a resumeMode",
    );
  });
});
