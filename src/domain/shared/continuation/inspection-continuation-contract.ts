export const INSPECTION_CONTINUATION_TOKEN_FIELD = "continuationToken" as const;

export const INSPECTION_CONTINUATION_ADMISSION_OUTCOMES = {
  INLINE: "inline",
  PREVIEW_FIRST: "preview-first",
  TASK_BACKED_REQUIRED: "task-backed-required",
} as const;

export const INSPECTION_CONTINUATION_STATUSES = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  EXPIRED: "expired",
} as const;

export type InspectionContinuationAdmissionOutcome =
  (typeof INSPECTION_CONTINUATION_ADMISSION_OUTCOMES)[keyof typeof INSPECTION_CONTINUATION_ADMISSION_OUTCOMES];

export type InspectionContinuationStatus =
  (typeof INSPECTION_CONTINUATION_STATUSES)[keyof typeof INSPECTION_CONTINUATION_STATUSES];

export interface InspectionContinuationAdmission {
  outcome: InspectionContinuationAdmissionOutcome;
  guidanceText: string | null;
  resumable: boolean;
}

export interface InspectionContinuationMetadata {
  continuationToken: string | null;
  familyMember: string | null;
  status: InspectionContinuationStatus | null;
  resumable: boolean;
  expiresAt: string | null;
}

export interface InspectionContinuationEnvelope {
  admission: InspectionContinuationAdmission;
  continuation: InspectionContinuationMetadata;
}

export interface InspectionContinuationSessionRecord<TRequest = unknown, TState = unknown> {
  continuationToken: string;
  endpointName: string;
  familyMember: string;
  requestPayload: TRequest;
  continuationState: TState;
  admissionOutcome: InspectionContinuationAdmissionOutcome;
  status: InspectionContinuationStatus;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
}

export interface InspectionContinuationSeed<TRequest = unknown, TState = unknown> {
  endpointName: string;
  familyMember: string;
  requestPayload: TRequest;
  continuationState: TState;
  admissionOutcome: InspectionContinuationAdmissionOutcome;
}

export interface ValidateContinuationOnlyRequestInput {
  continuationToken: string | undefined;
  queryFields: Record<string, unknown>;
}

export function createInlineContinuationEnvelope(): InspectionContinuationEnvelope {
  return {
    admission: {
      outcome: INSPECTION_CONTINUATION_ADMISSION_OUTCOMES.INLINE,
      guidanceText: null,
      resumable: false,
    },
    continuation: {
      continuationToken: null,
      familyMember: null,
      status: null,
      resumable: false,
      expiresAt: null,
    },
  };
}

export function createContinuationEnvelope(
  outcome: InspectionContinuationAdmissionOutcome,
  guidanceText: string | null,
  continuation:
    | Pick<InspectionContinuationMetadata, "continuationToken" | "familyMember" | "status" | "expiresAt">
    | null,
): InspectionContinuationEnvelope {
  if (continuation === null) {
    return {
      admission: {
        outcome,
        guidanceText,
        resumable: false,
      },
      continuation: {
        continuationToken: null,
        familyMember: null,
        status: null,
        resumable: false,
        expiresAt: null,
      },
    };
  }

  return {
    admission: {
      outcome,
      guidanceText,
      resumable: true,
    },
    continuation: {
      ...continuation,
      resumable: true,
    },
  };
}

export function createPersistedContinuationEnvelope(
  familyMember: string,
  continuationToken: string,
  status: InspectionContinuationStatus,
  expiresAt: string,
  guidanceText: string,
  outcome: InspectionContinuationAdmissionOutcome,
): InspectionContinuationEnvelope {
  return createContinuationEnvelope(outcome, guidanceText, {
    continuationToken,
    familyMember,
    status,
    expiresAt,
  });
}

export function getContinuationNotFoundMessage(familyMember: string): string {
  return `Continuation request for family '${familyMember}' could not be resumed because the supplied continuation token does not resolve to an active server-owned continuation session.`;
}

export function validateContinuationOnlyRequest(
  input: ValidateContinuationOnlyRequestInput,
): string[] {
  if (input.continuationToken === undefined) {
    return [];
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

  return invalidFieldNames.sort();
}

