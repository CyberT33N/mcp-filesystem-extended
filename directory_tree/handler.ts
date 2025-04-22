import { validatePath } from "../helpers/path.js";
import { buildDirectoryTree } from "./helpers.js";

export async function handleDirectoryTree(
  directoryPath: string,
  excludePatterns: string[],
  allowedDirectories: string[]
): Promise<string> {
  const validRootPath = await validatePath(directoryPath, allowedDirectories);
  const treeData = await buildDirectoryTree(
    validRootPath, 
    validRootPath, 
    excludePatterns,
    allowedDirectories
  );
  
  return JSON.stringify(treeData, null, 2);
}