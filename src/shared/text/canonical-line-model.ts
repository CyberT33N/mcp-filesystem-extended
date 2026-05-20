/**
 * Indicates whether a decoded text surface ends with a newline terminator.
 *
 * @remarks
 * The MCP server models addressable lines as LF-delimited records. A trailing
 * newline marks EOF termination but does not create a second addressable line
 * on its own.
 */
export function textEndsWithNewline(content: string): boolean {
  return content.endsWith("\n");
}

/**
 * Splits decoded text into addressable lines without inventing a phantom EOF
 * line from a trailing newline terminator.
 *
 * @remarks
 * Examples:
 * - `""` -> `[]`
 * - `"alpha"` -> `["alpha"]`
 * - `"alpha\n"` -> `["alpha"]`
 * - `"alpha\n\n"` -> `["alpha", ""]`
 */
export function splitTextIntoAddressableLines(content: string): string[] {
  if (content === "") {
    return [];
  }

  const lines = content.split("\n");

  if (textEndsWithNewline(content)) {
    lines.pop();
  }

  return lines;
}
