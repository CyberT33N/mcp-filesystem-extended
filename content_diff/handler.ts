import { createUnifiedDiff } from "../helpers/diff.js";

export async function handleContentDiff(
  content1: string,
  content2: string,
  label1: string,
  label2: string
): Promise<string> {
  // Generate a diff between the two content strings
  const diff = createUnifiedDiff(content1, content2, label1, label2);
  
  // Format the output with code fence
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  
  return `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}`;
}