import { z } from "zod";

export const ChecksumFilesArgsSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .describe("Paths to the files to generate checksums for. Pass one path for a single checksum calculation or multiple paths for a batch checksum calculation."),
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256").describe("Hash algorithm to use"),
});
