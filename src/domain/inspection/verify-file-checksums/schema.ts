import { z } from "zod";

export const VerifyFileChecksumsArgsSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe("Path to the file to verify"),
        expectedHash: z.string().describe("Expected hash value to compare against"),
      })
    )
    .min(1)
    .describe("Files to verify with their expected hashes. Pass one file for a single verification or multiple files for a batch verification."),
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256").describe("Hash algorithm to use"),
});

export const VerifyFileChecksumsResultSchema = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      expectedHash: z.string(),
      actualHash: z.string(),
      valid: z.boolean(),
    }),
  ),
  errors: z.array(
    z.object({
      path: z.string(),
      expectedHash: z.string(),
      error: z.string(),
    }),
  ),
  summary: z.object({
    validCount: z.number(),
    invalidCount: z.number(),
    errorCount: z.number(),
  }),
});
