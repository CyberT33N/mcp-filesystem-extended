/**
 * Shared application-layer annotation presets reused across extracted registration modules.
 */
export const READ_ONLY_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Shared application-layer annotations for additive tools.
 */
export const ADDITIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/**
 * Shared application-layer annotations for idempotent additive tools.
 */
export const IDEMPOTENT_ADDITIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Shared application-layer annotations for destructive tools.
 */
export const DESTRUCTIVE_LOCAL_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;
