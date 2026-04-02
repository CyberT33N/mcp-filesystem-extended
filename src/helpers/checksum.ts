import fs from "fs/promises";
import crypto from "crypto";

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

export async function calculateFileHash(
  filePath: string,
  algorithm: HashAlgorithm = "sha256"
): Promise<string> {
  // Read the file
  const data = await fs.readFile(filePath);
  
  // Calculate hash
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest("hex");
}
