import { z } from "zod";

export const ChecksumFilesArgsSchema = z.object({
  paths: z.array(z.string()).describe("Paths to the files to generate checksums for"),
  algorithm: z.enum(["md5", "sha1", "sha256", "sha512"]).default("sha256").describe("Hash algorithm to use"),
});
