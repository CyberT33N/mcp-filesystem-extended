import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";
import { createUnifiedDiff } from "../helpers/diff.js";

export async function handleFileDiff(
  file1Path: string,
  file2Path: string,
  allowedDirectories: string[]
): Promise<string> {
  const validFile1Path = await validatePath(file1Path, allowedDirectories);
  const validFile2Path = await validatePath(file2Path, allowedDirectories);
  
  try {
    // Read both files
    const file1Content = await fs.readFile(validFile1Path, 'utf-8');
    const file2Content = await fs.readFile(validFile2Path, 'utf-8');
    
    // Create a unified diff
    const diff = createUnifiedDiff(file1Content, file2Content, file1Path, file2Path);
    
    // Format diff with appropriate number of backticks
    let numBackticks = 3;
    while (diff.includes('`'.repeat(numBackticks))) {
      numBackticks++;
    }
    
    const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;
    
    if (diff.trim() === '') {
      return `Files are identical.`;
    }
    
    return formattedDiff;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error comparing files: ${errorMessage}`);
  }
}