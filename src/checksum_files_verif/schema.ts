import { z } from "zod";

export const ChecksumFilesVerifArgsSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().describe("Path to the file to verify"),
      expectedHash: z.string().describe("Expected hash value to compare against"),
    })
  ).describe("Array of files to verify with their expected hashes"),
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256").describe("Hash algorithm to use"),
});
