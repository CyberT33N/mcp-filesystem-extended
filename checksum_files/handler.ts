import { validatePath } from "../helpers/path.js";
import { calculateFileHash, HashAlgorithm } from "../helpers/checksum.js";

export async function handleChecksumFiles(
  filePaths: string[],
  algorithm: HashAlgorithm,
  allowedDirectories: string[]
): Promise<string> {
  const results: { path: string; hash: string }[] = [];
  const errors: { path: string; error: string }[] = [];
  
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        // Validate the path
        const validPath = await validatePath(filePath, allowedDirectories);
        
        // Calculate the hash
        const hash = await calculateFileHash(validPath, algorithm);
        
        results.push({ path: filePath, hash });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ path: filePath, error: errorMessage });
      }
    })
  );
  
  // Format the results
  let output = `Checksums (${algorithm}):\n\n`;
  
  if (results.length > 0) {
    for (const result of results) {
      output += `${result.hash}  ${result.path}\n`;
    }
  }
  
  if (errors.length > 0) {
    output += "\nErrors:\n";
    for (const error of errors) {
      output += `${error.path}: ${error.error}\n`;
    }
  }
  
  return output;
}