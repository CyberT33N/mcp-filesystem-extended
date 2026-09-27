import { describe, expect, it } from "vitest";

import { ListDirectoryEntriesStructuredResultSchema } from "@domain/inspection/list-directory-entries/schema";

describe("list_directory_entries schema", () => {
  it("parses structured listing results with recursively nested child entries", () => {
    const parsed = ListDirectoryEntriesStructuredResultSchema.parse({
      admission: {
        guidanceText: null,
        outcome: "inline",
        scopeReductionGuidanceText: null,
      },
      resume: {
        expiresAt: null,
        recommendedResumeMode: null,
        resumable: false,
        resumeToken: null,
        status: null,
        supportedResumeModes: [],
      },
      roots: [
        {
          entries: [
            {
              children: [
                {
                  name: "schema.ts",
                  path: "domain/schema.ts",
                  size: 128,
                  type: "file",
                },
              ],
              name: "domain",
              path: "domain",
              size: 0,
              type: "directory",
            },
          ],
          requestedPath: "src",
        },
      ],
      sessionDelivery: {
        continuationPass: false,
        previouslyDeliveredCount: 0,
        sessionTotalCount: 2,
      },
    });

    expect(parsed.roots[0]?.entries[0]?.children?.[0]?.name).toBe("schema.ts");
  });
});
