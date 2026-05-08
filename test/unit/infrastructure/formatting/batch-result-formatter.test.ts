import { describe, expect, it } from "vitest";

import {
  formatBatchMutationSummary,
  formatBatchTextOperationResults,
} from "@infrastructure/formatting/batch-result-formatter";

describe("batch_result_formatter", () => {
  it("formats grouped batch text operation results with deterministic success and error sections", () => {
    const output = formatBatchTextOperationResults("filesystem", [
      { label: "alpha.txt", output: "alpha result\n" },
      { label: "beta.txt", error: "Permission denied" },
      { label: "gamma.txt", output: "gamma result" },
    ]);

    expect(output).toBe(
      [
        "Processed 3 filesystem operations:",
        "- 2 operations completed successfully",
        "- 1 operation failed",
        "",
        "Results:",
        "[1] alpha.txt",
        "alpha result",
        "",
        "[2] gamma.txt",
        "gamma result",
        "",
        "Errors:",
        "- beta.txt: Permission denied",
      ].join("\n"),
    );
  });

  it("formats concise batch mutation summaries without echoing content payloads", () => {
    expect(formatBatchMutationSummary("files", 2, [])).toBe(
      "Processed 2 files:\n- 2 files processed successfully\n",
    );

    expect(
      formatBatchMutationSummary("files", 1, [
        "- file-b.txt: Access denied",
        "- file-c.txt: Already exists",
      ]),
    ).toBe(
      [
        "Processed 3 files:",
        "- 1 files processed successfully",
        "- 2 files failed",
        "",
        "Errors:",
        "- file-b.txt: Access denied",
        "- file-c.txt: Already exists",
      ].join("\n"),
    );
  });
});
