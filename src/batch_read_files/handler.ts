import fs from "fs/promises";
import { validatePath } from "../helpers/path.js";

export async function handleReadFiles(filePaths: string[], allowedDirectories: string[]): Promise<string> {
  const results = await Promise.all(
    filePaths.map(async (filePath: string) => {
      try {
        const validPath = await validatePath(filePath, allowedDirectories);
        const content = await fs.readFile(validPath, "utf-8");
        
        // Format content with line numbers
        const numberedContent = content
          .split('\n')
          .map((line, idx) => `${idx + 1}: ${line}`)
          .join('\n');
          
        return `${filePath}:\n${numberedContent}\n`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `${filePath}: Error - ${errorMessage}`;
      }
    }),
  );
  return results.join("\n---\n");
}