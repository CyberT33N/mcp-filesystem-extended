import { FILE_DIFF_RESPONSE_CAP_CHARS } from "@domain/shared/guardrails/tool-guardrail-limits";
import { assertActualTextBudget } from "@domain/shared/guardrails/text-response-budget";
import fs from "fs/promises";
import {
  createUnifiedDiff,
  normalizeLineEndings,
  wrapDiffInSafeFencedBlock,
} from "@infrastructure/formatting/unified-diff";

/**
 * Configures how line-range replacements are applied before preview generation and optional writes.
 */
export interface ReplaceFileLineRangesOptions {
  /**
   * Preserves the indentation of the first replaced line on the first inserted line when enabled.
   */
  preserveIndentation: boolean;
}

/**
 * Applies validated line-range replacements to one file, builds a complete diff preview, and refuses
 * oversize preview output before any successful result is returned.
 *
 * @param filePath - Absolute validated file path whose line ranges should be replaced.
 * @param replacements - Inclusive line-range replacements using the canonical `replacementText` payload surface.
 * @param dryRun - When true, computes the preview without writing the file.
 * @param options - Controls indentation preservation during replacement application.
 * @returns A complete diff preview and replacement summary for the requested line-range update.
 */
export async function applyFileLineRangeReplacements(
  filePath: string,
  replacements: Array<{startLine: number, endLine: number, replacementText: string}>,
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
    replacement: {startLine: number, endLine: number, replacementText: string},
    applied: boolean,
    message?: string
  }> = [];
  
  for (const replacement of sortedReplacements) {
    const { startLine, endLine, replacementText } = replacement;
    const replacementResult: {
      replacement: {startLine: number, endLine: number, replacementText: string},
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
    
    // Normalize replacementText
    const normalizedNew = normalizeLineEndings(replacementText);
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
  
  // Build result with detailed information
  let resultText = `${wrapDiffInSafeFencedBlock(diff)}\n\n`;
  
  // Add replacement details
  resultText += "Replacement details:\n";
  replacementResults.forEach((result, i) => {
    const { startLine, endLine } = result.replacement;
    resultText += `Replacement ${i + 1}: ${result.applied ? 'APPLIED' : 'FAILED'} (lines ${startLine}-${endLine})\n`;
    if (result.message) {
      resultText += `  Message: ${result.message}\n`;
    }
  });

  assertActualTextBudget(
    "replace_file_line_ranges",
    resultText.length,
    FILE_DIFF_RESPONSE_CAP_CHARS,
    "Line-range replacement preview output exceeds the file-diff family cap.",
  );
  
  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }
  
  return resultText;
}
