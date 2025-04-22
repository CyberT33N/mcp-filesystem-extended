import { validatePath } from "../helpers/path.js";
import { searchFiles } from "./helpers.js";

export async function handleSearchFiles(
  directoryPath: string,
  pattern: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const validPath = await validatePath(directoryPath, allowedDirectories);
  const results = await searchFiles(validPath, pattern, excludePatterns, allowedDirectories);
  return results.length > 0 ? results.join("\n") : "No matches found";
}