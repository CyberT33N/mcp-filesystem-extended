import fs from "fs/promises";
import {
  createUnifiedDiff,
  normalizeLineEndings,
} from "@infrastructure/formatting/unified-diff";

export interface ReplaceFileLineRangesOptions {
  preserveIndentation: boolean;
}

export async function applyFileLineRangeReplacements(
  filePath: string,
  replacements: Array<{startLine: number, endLine: number, newText: string}>,
  dryRun: boolean = false,
  options: ReplaceFileLineRangesOptions = { preserveIndentation: true }
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));
  
  // Split content into lines
  const contentLines = content.split('\n');
  
  // Sort replacements by line number in descending order to avoid affecting line numbers of earlier updates
  const sortedReplacements = [...replacements].sort((a, b) => b.startLine - a.startLine);
  
  // Apply replacements sequentially
  let modifiedContentLines = [...contentLines];
  const replacementResults: Array<{
    replacement: {startLine: number, endLine: number, newText: string},
    applied: boolean,
    message?: string
  }> = [];
  
  for (const replacement of sortedReplacements) {
    const { startLine, endLine, newText } = replacement;
    const replacementResult: {
      replacement: {startLine: number, endLine: number, newText: string},
      applied: boolean,
      message?: string
    } = { replacement, applied: false };
    
    // Validate line numbers
    if (startLine < 1 || endLine < startLine || endLine > contentLines.length) {
      replacementResult.message = `Invalid line range: ${startLine}-${endLine} (file has ${contentLines.length} lines)`;
      replacementResults.push(replacementResult);
      throw new Error(replacementResult.message);
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
      const originalIndent = modifiedContentLines[startIndex]!.match(/^\s*/)?.[0] || '';
      
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
    
    replacementResult.applied = true;
    replacementResults.push(replacementResult);
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
  
  // Add replacement details
  resultText += "Replacement details:\n";
  replacementResults.forEach((result, i) => {
    const { startLine, endLine } = result.replacement;
    resultText += `Replacement ${i + 1}: ${result.applied ? 'APPLIED' : 'FAILED'} (lines ${startLine}-${endLine})\n`;
    if (result.message) {
      resultText += `  Message: ${result.message}\n`;
    }
  });
  
  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }
  
  return resultText;
}
