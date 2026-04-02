import { validatePath } from "../helpers/path.js";
import { calculateFileHash, HashAlgorithm } from "../helpers/checksum.js";
import {validateHash} from "./helpers.js";

interface FileVerificationResult {
  path: string;
  expectedHash: string;
  actualHash: string;
  valid: boolean;
}

interface FileVerificationError {
  path: string;
  expectedHash: string;
  error: string;
}

export async function handleChecksumFilesVerif(
  files: Array<{ path: string; expectedHash: string }>,
  algorithm: HashAlgorithm,
  allowedDirectories: string[]
): Promise<string> {
  const results: FileVerificationResult[] = [];
  const errors: FileVerificationError[] = [];
  
  await Promise.all(
    files.map(async (file) => {
      try {
        // Validate the path
        const validPath = await validatePath(file.path, allowedDirectories);
        
        // Calculate the hash
        const actualHash = await calculateFileHash(validPath, algorithm);
        
        // Compare with expected hash
        const isValid = validateHash(actualHash, file.expectedHash);
        
        results.push({
          path: file.path,
          expectedHash: file.expectedHash,
          actualHash,
          valid: isValid
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          path: file.path,
          expectedHash: file.expectedHash,
          error: errorMessage
        });
      }
    })
  );
  
  // Count successes and failures
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.filter(r => !r.valid).length;
  const errorCount = errors.length;
  
  // Format the results
  let output = `Checksum Verification Results (${algorithm}):\n`;
  output += `✅ Valid: ${validCount}\n`;
  output += `❌ Invalid: ${invalidCount}\n`;
  output += `⚠️ Errors: ${errorCount}\n\n`;
  
  // Valid files
  if (validCount > 0) {
    output += "Valid Files:\n";
    for (const result of results.filter(r => r.valid)) {
      output += `✓ ${result.path}\n`;
    }
    output += "\n";
  }
  
  // Invalid files
  if (invalidCount > 0) {
    output += "Invalid Files:\n";
    for (const result of results.filter(r => !r.valid)) {
      output += `✗ ${result.path}\n`;
      output += `  Expected: ${result.expectedHash}\n`;
      output += `  Actual:   ${result.actualHash}\n`;
    }
    output += "\n";
  }
  
  // Errors
  if (errorCount > 0) {
    output += "Errors:\n";
    for (const error of errors) {
      output += `! ${error.path}: ${error.error}\n`;
    }
  }
  
  return output;
}