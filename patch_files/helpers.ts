import fs from "fs/promises";
import {createUnifiedDiff, normalizeLineEndings} from "../helpers/diff.js";

export interface PatchOptions {
  preserveIndentation: boolean;
}

export async function applyFilePatches(
  filePath: string,
  patches: Array<{startLine: number, endLine: number, newText: string}>,
  dryRun: boolean = false,
  options: PatchOptions = { preserveIndentation: true }
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));
  
  // Split content into lines
  const contentLines = content.split('\n');
  
  // Sort patches by line number in descending order to avoid affecting line numbers of earlier patches
  const sortedPatches = [...patches].sort((a, b) => b.startLine - a.startLine);
  
  // Apply patches sequentially
  let modifiedContentLines = [...contentLines];
  const patchResults: Array<{
    patch: {startLine: number, endLine: number, newText: string},
    applied: boolean,
    message?: string
  }> = [];
  
  for (const patch of sortedPatches) {
    const { startLine, endLine, newText } = patch;
    const patchResult: {
      patch: {startLine: number, endLine: number, newText: string},
      applied: boolean,
      message?: string
    } = { patch, applied: false };
    
    // Validate line numbers
    if (startLine < 1 || endLine < startLine || endLine > contentLines.length) {
      patchResult.message = `Invalid line range: ${startLine}-${endLine} (file has ${contentLines.length} lines)`;
      patchResults.push(patchResult);
      throw new Error(patchResult.message);
    }
    
    // Convert to 0-based indices for array
    const startIndex = startLine - 1;
    const endIndex = endLine - 1;
    const linesToReplace = endIndex - startIndex + 1;
    
    // Normalize newText
    const normalizedNew = normalizeLineEndings(newText);
    const newLines = normalizedNew.split('\n');
    
    if (options.preserveIndentation) {
      // Detect indentation from the first line being replaced
      const originalIndent = modifiedContentLines[startIndex].match(/^\s*/)?.[0] || '';
      
      // Apply indentation to new lines
      const indentedNewLines = newLines.map((line, idx) => {
        if (idx === 0) return originalIndent + line.trimStart();
        return line;
      });
      
      // Replace lines
      modifiedContentLines.splice(startIndex, linesToReplace, ...indentedNewLines);
    } else {
      // Replace lines without preserving indentation
      modifiedContentLines.splice(startIndex, linesToReplace, ...newLines);
    }
    
    patchResult.applied = true;
    patchResults.push(patchResult);
  }
  
  const modifiedContent = modifiedContentLines.join('\n');
  
  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath, filePath);
  
  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  
  // Build result with detailed information
  let resultText = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;
  
  // Add patch details
  resultText += "Patch details:\n";
  patchResults.forEach((result, i) => {
    const { startLine, endLine } = result.patch;
    resultText += `Patch ${i + 1}: ${result.applied ? 'APPLIED' : 'FAILED'} (lines ${startLine}-${endLine})\n`;
    if (result.message) {
      resultText += `  Message: ${result.message}\n`;
    }
  });
  
  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }
  
  return resultText;
}