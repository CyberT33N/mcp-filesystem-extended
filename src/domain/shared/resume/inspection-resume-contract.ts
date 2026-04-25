import { z } from "zod";

/**
 * Public request field that resumes one persisted server-owned inspection session.
 */
export const INSPECTION_RESUME_TOKEN_FIELD = "resumeToken" as const;

/**
 * Public request field that selects how the server should continue one persisted resume session.
 */
export const INSPECTION_RESUME_MODE_FIELD = "resumeMode" as const;

/**
 * Canonical admission outcomes for inspection responses after the resume-session remodel.
 */
export const INSPECTION_RESUME_ADMISSION_OUTCOMES = {
  INLINE: "inline",
  PREVIEW_FIRST: "preview-first",
  COMPLETION_BACKED_REQUIRED: "completion-backed-required",
  NARROWING_REQUIRED: "narrowing-required",
} as const;

/**
 * Canonical server-owned resume intents.
 */
export const INSPECTION_RESUME_MODES = {
  NEXT_CHUNK: "next-chunk",
  COMPLETE_RESULT: "complete-result",
} as const;

/**
 * Preview-family supported resume-mode set.
 */
export const INSPECTION_PREVIEW_SUPPORTED_RESUME_MODES = [
  INSPECTION_RESUME_MODES.NEXT_CHUNK,
  INSPECTION_RESUME_MODES.COMPLETE_RESULT,
] as const;

/**
 * Completion-backed-only supported resume-mode set.
 */
export const INSPECTION_COMPLETION_ONLY_RESUME_MODES = [
  INSPECTION_RESUME_MODES.COMPLETE_RESULT,
] as const;

/**
 * Canonical lifecycle states for one persisted inspection resume session.
 */
export const INSPECTION_RESUME_STATUSES = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

/**
 * Admission outcome selected by the server for one inspection response.
 */
export type InspectionResumeAdmissionOutcome =
  (typeof INSPECTION_RESUME_ADMISSION_OUTCOMES)[keyof typeof INSPECTION_RESUME_ADMISSION_OUTCOMES];

/**
 * Resume intent selected by the caller for one persisted inspection session.
 */
export type InspectionResumeMode =
  (typeof INSPECTION_RESUME_MODES)[keyof typeof INSPECTION_RESUME_MODES];

/**
 * Lifecycle state stored for one persisted inspection resume session.
 */
export type InspectionResumeStatus =
  (typeof INSPECTION_RESUME_STATUSES)[keyof typeof INSPECTION_RESUME_STATUSES];

/**
 * Admission metadata that explains which bounded response lane the server selected.
 */
export interface InspectionResumeAdmission {
  /**
   * Canonical lane outcome for the current response.
   */
  outcome: InspectionResumeAdmissionOutcome;

  /**
   * Server-owned guidance that explains the current bounded delivery or completion state.
   *
   * @remarks
   * In `complete-result` mode this field carries the canonical machine-readable additive
   * continuation statement. When the server delivers the frontier-continuation payload for a
   * prior preview-first session, this field is set to a statement equivalent to:
   * `"Continuation response. This payload contains entries from the persisted frontier position
   * onward. Combine with the prior preview-chunk payload for the complete dataset."`
   *
   * Callers must read this field to correctly reconstruct the full dataset. Restarting traversal
   * from the root in `complete-result` mode is incorrect — the continuation payload is additive,
   * not a full re-delivery.
   *
   * @see {@link conventions/resume-architecture/overview.md} for the full additive continuation rationale.
   * @see {@link conventions/resume-architecture/workflow.md} for the step-by-step `complete-result` flow.
   */
  guidanceText: string | null;

  /**
   * First-class scope-reduction guidance that callers may use instead of resume.
   */
  scopeReductionGuidanceText: string | null;
}

/**
 * Authoritative resume metadata returned to the caller.
 */
export interface InspectionResumeMetadata {
  /**
   * Opaque persisted server-owned session handle.
   */
  resumeToken: string | null;

  /**
   * Whether the current response can be resumed on the same endpoint.
   */
  resumable: boolean;

  /**
   * Persisted session lifecycle state when a resume token is active.
   */
  status: InspectionResumeStatus | null;

  /**
   * Expiration timestamp for the active persisted session.
   */
  expiresAt: string | null;

  /**
   * Resume intents that the current endpoint family accepts for the active session.
   */
  supportedResumeModes: InspectionResumeMode[];

  /**
   * Server-recommended resume intent for the current active session.
   */
  recommendedResumeMode: InspectionResumeMode | null;
}

/**
 * Shared admission-plus-resume envelope surfaced by inspection families.
 */
export interface InspectionResumeEnvelope {
  /**
   * Admission metadata for the current bounded response lane.
   */
  admission: InspectionResumeAdmission;

  /**
   * Authoritative persisted resume-session metadata.
   */
  resume: InspectionResumeMetadata;
}

/**
 * Persisted server-owned inspection resume-session record.
 */
export interface InspectionResumeSessionRecord<TRequest = unknown, TState = unknown> {
  /**
   * Opaque persisted session identifier.
   */
  resumeToken: string;

  /**
   * Exact endpoint name that owns the session.
   */
  endpointName: string;

  /**
   * Exact family member that owns the session.
   */
  familyMember: string;

  /**
   * Normalized request payload persisted by the server.
   */
  requestPayload: TRequest;

  /**
   * Persisted execution state owned by the server.
   */
  resumeState: TState;

  /**
   * Admission outcome that created the persisted session.
   */
  admissionOutcome: InspectionResumeAdmissionOutcome;

  /**
   * Most recent resume intent requested for the persisted session.
   */
  lastRequestedResumeMode: InspectionResumeMode | null;

  /**
   * Current persisted session status.
   */
  status: InspectionResumeStatus;

  /**
   * Session creation timestamp.
   */
  createdAt: string;

  /**
   * Most recent access timestamp.
   */
  lastAccessedAt: string;

  /**
   * Session expiration timestamp.
   */
  expiresAt: string;
}

/**
 * Input required to create one persisted inspection resume session.
 */
export interface InspectionResumeSessionSeed<TRequest = unknown, TState = unknown> {
  /**
   * Exact endpoint name that owns the new session.
   */
  endpointName: string;

  /**
   * Exact family member that owns the new session.
   */
  familyMember: string;

  /**
   * Normalized request payload persisted for future resume calls.
   */
  requestPayload: TRequest;

  /**
   * Initial server-owned execution state.
   */
  resumeState: TState;

  /**
   * Admission outcome that created the session.
   */
  admissionOutcome: InspectionResumeAdmissionOutcome;

  /**
   * Most recent caller-selected resume mode when available.
   */
  lastRequestedResumeMode?: InspectionResumeMode | null;
}

/**
 * Request validation input for resume-only same-endpoint requests.
 */
export interface ValidateResumeOnlyRequestInput {
  /**
   * Opaque persisted session handle supplied by the caller.
   */
  resumeToken: string | undefined;

  /**
   * Resume intent supplied by the caller.
   */
  resumeMode: InspectionResumeMode | undefined;

  /**
   * Query-defining fields that must be absent for resume-only requests.
   */
  queryFields: Record<string, unknown>;
}

/**
 * Validation result for resume-only same-endpoint requests.
 */
export interface ValidateResumeOnlyRequestResult {
  /**
   * Query-defining field names that were still present on a resume-only request.
   */
  invalidFieldNames: string[];

  /**
   * Whether the request omitted the mandatory resume intent.
   */
  missingResumeMode: boolean;
}

/**
 * Zod schema for the admission metadata returned by preview-family inspection endpoints.
 *
 * @remarks
 * Mirrors the {@link InspectionResumeAdmission} interface and is the shared Zod contract
 * used by all five preview-family endpoint result schemas. Use
 * {@link InspectionCompletionOnlyAdmissionSchema} for completion-backed-only families.
 */
export const InspectionResumeAdmissionSchema = z.object({
  outcome: z.enum([
    INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.PREVIEW_FIRST,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
  ]),
  guidanceText: z.string().nullable(),
  scopeReductionGuidanceText: z.string().nullable(),
});

/**
 * Zod schema for the resume metadata returned by preview-family inspection endpoints.
 *
 * @remarks
 * Mirrors the {@link InspectionResumeMetadata} interface and is the shared Zod contract
 * used by all five preview-family endpoint result schemas. Use
 * {@link InspectionCompletionOnlyResumeMetadataSchema} for completion-backed-only families.
 */
export const InspectionResumeMetadataSchema = z.object({
  resumeToken: z.string().nullable(),
  supportedResumeModes: z.array(
    z.enum([INSPECTION_RESUME_MODES.NEXT_CHUNK, INSPECTION_RESUME_MODES.COMPLETE_RESULT]),
  ),
  recommendedResumeMode: z
    .enum([INSPECTION_RESUME_MODES.NEXT_CHUNK, INSPECTION_RESUME_MODES.COMPLETE_RESULT])
    .nullable(),
  status: z.enum([
    INSPECTION_RESUME_STATUSES.ACTIVE,
    INSPECTION_RESUME_STATUSES.CANCELLED,
    INSPECTION_RESUME_STATUSES.COMPLETED,
    INSPECTION_RESUME_STATUSES.EXPIRED,
  ]).nullable(),
  resumable: z.boolean(),
  expiresAt: z.string().nullable(),
});

/**
 * Zod schema for the admission metadata returned by completion-backed-only inspection endpoints.
 *
 * @remarks
 * Restricted variant that excludes `PREVIEW_FIRST` from the admission outcome enum.
 * Used by `count_lines` which supports only `complete-result` resume mode.
 */
export const InspectionCompletionOnlyAdmissionSchema = z.object({
  outcome: z.enum([
    INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.COMPLETION_BACKED_REQUIRED,
    INSPECTION_RESUME_ADMISSION_OUTCOMES.NARROWING_REQUIRED,
  ]),
  guidanceText: z.string().nullable(),
  scopeReductionGuidanceText: z.string().nullable(),
});

/**
 * Zod schema for the resume metadata returned by completion-backed-only inspection endpoints.
 *
 * @remarks
 * Restricted variant that allows only `complete-result` in `supportedResumeModes` and
 * `recommendedResumeMode`. Used by `count_lines` which is strictly completion-backed-only.
 */
export const InspectionCompletionOnlyResumeMetadataSchema = z.object({
  resumeToken: z.string().nullable(),
  supportedResumeModes: z.array(z.enum([INSPECTION_RESUME_MODES.COMPLETE_RESULT])),
  recommendedResumeMode: z.enum([INSPECTION_RESUME_MODES.COMPLETE_RESULT]).nullable(),
  status: z.enum([
    INSPECTION_RESUME_STATUSES.ACTIVE,
    INSPECTION_RESUME_STATUSES.CANCELLED,
    INSPECTION_RESUME_STATUSES.COMPLETED,
    INSPECTION_RESUME_STATUSES.EXPIRED,
  ]).nullable(),
  resumable: z.boolean(),
  expiresAt: z.string().nullable(),
});

/**
 * Shared superRefine helper that applies the three common resume-mode/token validation
 * checks shared by all preview-family and completion-backed-only inspection endpoint schemas.
 *
 * @remarks
 * Each endpoint schema retains its own primary-field checks (e.g. roots required, pattern
 * required). This helper owns only the three mode/token invariants that are identical across
 * every consumer: mode-without-token, missing-mode-on-resume, and query-fields-on-resume.
 *
 * @param args - Validated args object carrying at minimum `resumeToken` and `resumeMode`.
 * @param ctx - Zod refinement context used to report issues.
 * @param hasQueryDefiningFields - Whether the caller supplied any query-defining fields.
 */
export function applyCommonResumeSchemaRefinement(
  args: {
    readonly resumeToken?: string | undefined;
    readonly resumeMode?: string | undefined;
  },
  ctx: z.RefinementCtx,
  hasQueryDefiningFields: boolean,
): void {
  const isResumeRequest = args.resumeToken !== undefined;

  if (!isResumeRequest && args.resumeMode !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Base requests must not provide a resume mode without a resume token.",
      path: [INSPECTION_RESUME_MODE_FIELD],
    });
  }

  if (isResumeRequest && args.resumeMode === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resume-only requests must provide a resumeMode.",
      path: [INSPECTION_RESUME_MODE_FIELD],
    });
  }

  if (isResumeRequest && hasQueryDefiningFields) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Resume-only requests must omit new query-defining fields and rely on the persisted request context.",
      path: [INSPECTION_RESUME_TOKEN_FIELD],
    });
  }
}

function createEmptyResumeMetadata(): InspectionResumeMetadata {
  return {
    resumeToken: null,
    resumable: false,
    status: null,
    expiresAt: null,
    supportedResumeModes: [],
    recommendedResumeMode: null,
  };
}

/**
 * Builds the canonical inline response envelope when no persisted resume session is active.
 *
 * @returns Shared inline admission-plus-resume metadata with no active session handle.
 */
export function createInlineResumeEnvelope(): InspectionResumeEnvelope {
  return {
    admission: {
      outcome: INSPECTION_RESUME_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
      scopeReductionGuidanceText: null,
    },
    resume: createEmptyResumeMetadata(),
  };
}

/**
 * Builds the shared admission-plus-resume envelope for one inspection response.
 *
 * @param outcome - Canonical lane outcome for the current response.
 * @param guidanceText - Server-owned guidance for the current bounded delivery or completion state.
 * In `complete-result` mode this must carry the canonical additive continuation statement so that
 * callers know the payload is frontier-based and must be combined with the prior preview chunk.
 * @see {@link InspectionResumeAdmission.guidanceText} for the full additive continuation semantics.
 * @param scopeReductionGuidanceText - First-class narrowing guidance surfaced alongside resume.
 * @param resume - Active persisted resume metadata when the response remains resumable.
 * @returns Shared admission-plus-resume envelope for the current response.
 */
export function createResumeEnvelope(
  outcome: InspectionResumeAdmissionOutcome,
  guidanceText: string | null,
  scopeReductionGuidanceText: string | null,
  resume:
    | Omit<InspectionResumeMetadata, "resumable">
    | null,
): InspectionResumeEnvelope {
  if (resume === null || resume.resumeToken === null) {
    return {
      admission: {
        outcome,
        guidanceText,
        scopeReductionGuidanceText,
      },
      resume: {
        ...createEmptyResumeMetadata(),
        supportedResumeModes: resume?.supportedResumeModes ?? [],
        recommendedResumeMode: resume?.recommendedResumeMode ?? null,
      },
    };
  }

  return {
    admission: {
      outcome,
      guidanceText,
      scopeReductionGuidanceText,
    },
    resume: {
      ...resume,
      resumable: true,
    },
  };
}

/**
 * Builds the shared admission-plus-resume envelope for one active persisted session.
 *
 * @param resumeToken - Opaque persisted session handle.
 * @param status - Current persisted session status.
 * @param expiresAt - Persisted session expiration timestamp.
 * @param supportedResumeModes - Resume intents supported by the current endpoint family.
 * @param recommendedResumeMode - Server-recommended resume intent for the current state.
 * @param guidanceText - Server-owned guidance for the current resumable state.
 * @param scopeReductionGuidanceText - First-class narrowing guidance surfaced alongside resume.
 * @param outcome - Canonical lane outcome for the current response.
 * @returns Shared admission-plus-resume envelope for one active persisted session.
 */
export function createPersistedResumeEnvelope(
  resumeToken: string,
  status: InspectionResumeStatus,
  expiresAt: string,
  supportedResumeModes: readonly InspectionResumeMode[],
  recommendedResumeMode: InspectionResumeMode | null,
  guidanceText: string,
  scopeReductionGuidanceText: string | null,
  outcome: InspectionResumeAdmissionOutcome,
): InspectionResumeEnvelope {
  return createResumeEnvelope(outcome, guidanceText, scopeReductionGuidanceText, {
    resumeToken,
    status,
    expiresAt,
    supportedResumeModes: [...supportedResumeModes],
    recommendedResumeMode,
  });
}

/**
 * Returns the canonical not-found-class resume failure message for one family.
 *
 * @param familyMember - Exact family member that owns the missing or unusable session.
 * @returns Deterministic server-owned not-found-class resume failure text.
 */
export function getResumeSessionNotFoundMessage(familyMember: string): string {
  return `Resume request for family '${familyMember}' could not be fulfilled because the supplied resume token does not resolve to an active server-owned resume session.`;
}

/**
 * Validates that a resume-only request omits fresh query-defining fields.
 *
 * @param input - Resume-only request surface to validate.
 * @returns Invalid query-field names plus the mandatory-resume-mode check result.
 */
export function validateResumeOnlyRequest(
  input: ValidateResumeOnlyRequestInput,
): ValidateResumeOnlyRequestResult {
  if (input.resumeToken === undefined) {
    return {
      invalidFieldNames: [],
      missingResumeMode: false,
    };
  }

  const invalidFieldNames: string[] = [];

  for (const [fieldName, fieldValue] of Object.entries(input.queryFields)) {
    if (fieldValue === undefined || fieldValue === null) {
      continue;
    }

    if (typeof fieldValue === "string" && fieldValue === "") {
      continue;
    }

    if (Array.isArray(fieldValue) && fieldValue.length === 0) {
      continue;
    }

    if (typeof fieldValue === "boolean" && fieldValue === false) {
      continue;
    }

    invalidFieldNames.push(fieldName);
  }

  return {
    invalidFieldNames: invalidFieldNames.sort(),
    missingResumeMode: input.resumeMode === undefined,
  };
}
