import { z } from "zod";

import type { TraversalCandidateWorkloadEvidence } from "./traversal-candidate-workload";

/**
 * Canonical coarse volume bands carried by every admission-projection field.
 *
 * @remarks
 * The projection is deliberately a Grobband, never an exact count: exact pre-execution volume
 * computation is architecturally impossible (token-size blindness), so the envelope reports the
 * order-of-magnitude class instead.
 */
export const TRAVERSAL_ADMISSION_PROJECTION_BANDS = {
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
  HUGE: "huge",
} as const;

/**
 * Canonical confidence declarations carried by every band-valued projection field.
 */
export const TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

/**
 * Canonical reasons for honestly reporting a projection field as unavailable.
 *
 * @remarks
 * `probe_truncated_hard` — the bounded probe stopped before it could measure any part of the
 * candidate surface, so even a band would be a false statement.
 * `match_density_unknown` — the match-dependent yield only materializes during the native
 * backend execution and cannot be projected from candidate metadata.
 * `no_execution_cost_model` — the endpoint family supplies no execution-cost model, so a
 * duration projection would be invented rather than derived.
 */
export const TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS = {
  PROBE_TRUNCATED_HARD: "probe_truncated_hard",
  MATCH_DENSITY_UNKNOWN: "match_density_unknown",
  NO_EXECUTION_COST_MODEL: "no_execution_cost_model",
} as const;

/**
 * Coarse volume band of one projection field.
 */
export type TraversalAdmissionProjectionBand =
  (typeof TRAVERSAL_ADMISSION_PROJECTION_BANDS)[keyof typeof TRAVERSAL_ADMISSION_PROJECTION_BANDS];

/**
 * Declared confidence of one band-valued projection field.
 */
export type TraversalAdmissionProjectionConfidence =
  (typeof TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES)[keyof typeof TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES];

/**
 * Canonical reason why one projection field is unavailable.
 */
export type TraversalAdmissionProjectionUnavailableReason =
  (typeof TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS)[keyof typeof TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS];

/**
 * Band-valued projection field derived from bounded probe evidence.
 */
export interface TraversalAdmissionProjectionBandValue {
  /**
   * Coarse order-of-magnitude class derived from already-processed probe state.
   */
  band: TraversalAdmissionProjectionBand;

  /**
   * Declared confidence in the band; low when the probe stopped early.
   */
  confidence: TraversalAdmissionProjectionConfidence;

  /**
   * Whether the bounded probe stopped before the full candidate surface was exhausted;
   * when true the band is a documented lower bound, never an estimate of the total.
   */
  probeTruncated: boolean;
}

/**
 * Honestly unavailable projection field.
 */
export interface TraversalAdmissionProjectionUnavailableValue {
  /**
   * Always `false`: the field could not be projected honestly.
   */
  available: false;

  /**
   * Canonical reason why the field carries no band.
   */
  reason: TraversalAdmissionProjectionUnavailableReason;
}

/**
 * One admission-projection field: either an honest band or an honest unavailable marker.
 */
export type TraversalAdmissionProjectionField =
  | TraversalAdmissionProjectionBandValue
  | TraversalAdmissionProjectionUnavailableValue;

/**
 * Per-request workload projection carried inside the machine-readable admission envelope.
 *
 * @remarks
 * This surface is `artifact_projection_only`: it mirrors the bound candidate-workload probe
 * truth of the current request so a consuming agent can size the workload before any
 * continuation, narrowing, or delegation decision. It is never an escalation, planning, or
 * spawn authority by itself — those decisions belong to the consuming governance layer.
 */
export interface TraversalAdmissionProjection {
  /**
   * Coarse band of the total candidate-entry volume observed by the bounded probe.
   */
  estimatedTotalEntries: TraversalAdmissionProjectionField;

  /**
   * Coarse band of the total candidate bytes observed by the bounded probe.
   */
  estimatedTotalCandidateBytes: TraversalAdmissionProjectionField;

  /**
   * Coarse band of the projected caller-visible response characters, when a family response
   * estimator supplied evidence; otherwise honestly unavailable.
   */
  estimatedTotalResponseChars: TraversalAdmissionProjectionField;

  /**
   * Coarse band of the projected remaining execution duration derived from the family
   * execution-cost model, when available; otherwise honestly unavailable.
   */
  estimatedRemainingDurationMs: TraversalAdmissionProjectionField;
}

/**
 * Zod schema for one projection field: band form or honest unavailable form.
 */
export const TraversalAdmissionProjectionFieldSchema = z.union([
  z.object({
    band: z.enum([
      TRAVERSAL_ADMISSION_PROJECTION_BANDS.SMALL,
      TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM,
      TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE,
      TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE,
    ]),
    confidence: z.enum([
      TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.LOW,
      TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.MEDIUM,
      TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.HIGH,
    ]),
    probeTruncated: z.boolean(),
  }),
  z.object({
    available: z.literal(false),
    reason: z.enum([
      TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.PROBE_TRUNCATED_HARD,
      TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.MATCH_DENSITY_UNKNOWN,
      TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.NO_EXECUTION_COST_MODEL,
    ]),
  }),
]);

/**
 * Zod schema for the per-request admission projection envelope surface.
 *
 * @remarks
 * Mirrors the {@link TraversalAdmissionProjection} interface so every preview-family endpoint
 * admission schema can embed the same machine-readable projection contract.
 */
export const TraversalAdmissionProjectionSchema = z.object({
  estimatedTotalEntries: TraversalAdmissionProjectionFieldSchema,
  estimatedTotalCandidateBytes: TraversalAdmissionProjectionFieldSchema,
  estimatedTotalResponseChars: TraversalAdmissionProjectionFieldSchema,
  estimatedRemainingDurationMs: TraversalAdmissionProjectionFieldSchema,
});

/**
 * Execution-cost model inputs required to project the remaining execution duration.
 *
 * @remarks
 * The values mirror the consumer-capability fields used by the shared traversal admission
 * decision, so the duration projection stays consistent with the admission planning reality.
 */
export interface TraversalAdmissionProjectionCostModel {
  /**
   * Multiplier that projects bounded probe time into conservative lane-local execution time.
   */
  executionTimeCostMultiplier: number;

  /**
   * Additional conservative per-candidate-file cost in milliseconds.
   */
  estimatedPerCandidateFileCostMs: number;
}

/**
 * Input for building one honest per-request admission projection.
 */
export interface BuildTraversalAdmissionProjectionInput {
  /**
   * Bounded candidate-workload evidence collected by the probe for the current request.
   */
  candidateWorkloadEvidence: TraversalCandidateWorkloadEvidence;

  /**
   * Family execution-cost model used for the duration projection; omit when the family
   * supplies no cost model.
   */
  executionCostModel?: TraversalAdmissionProjectionCostModel | null;
}

function deriveCharVolumeBand(value: number): TraversalAdmissionProjectionBand {
  if (value < 50_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.SMALL;
  }

  if (value < 150_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM;
  }

  if (value < 450_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE;
  }

  return TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE;
}

function deriveEntryVolumeBand(value: number): TraversalAdmissionProjectionBand {
  if (value < 1_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.SMALL;
  }

  if (value < 10_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM;
  }

  if (value < 100_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE;
  }

  return TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE;
}

function deriveDurationBand(value: number): TraversalAdmissionProjectionBand {
  if (value < 5_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.SMALL;
  }

  if (value < 30_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.MEDIUM;
  }

  if (value < 120_000) {
    return TRAVERSAL_ADMISSION_PROJECTION_BANDS.LARGE;
  }

  return TRAVERSAL_ADMISSION_PROJECTION_BANDS.HUGE;
}

function buildMeasuredBandField(
  value: number,
  probeTruncated: boolean,
  deriveBand: (measuredValue: number) => TraversalAdmissionProjectionBand,
): TraversalAdmissionProjectionField {
  if (probeTruncated && value === 0) {
    return {
      available: false,
      reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.PROBE_TRUNCATED_HARD,
    };
  }

  return {
    band: deriveBand(value),
    confidence: probeTruncated
      ? TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.LOW
      : TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.HIGH,
    probeTruncated,
  };
}

/**
 * Builds one honest per-request admission projection from bounded probe evidence.
 *
 * @param input - Candidate-workload evidence plus the optional family execution-cost model.
 * @returns The projection with one band or unavailable marker per field. Measured surfaces
 * (entries, bytes) carry high confidence on a complete probe and low confidence with a
 * documented lower bound when the probe truncated. The response-character projection is
 * unavailable when the family supplied no response estimator. The duration projection is
 * unavailable when no execution-cost model is supplied and medium confidence when modeled.
 */
export function buildTraversalAdmissionProjection(
  input: BuildTraversalAdmissionProjectionInput,
): TraversalAdmissionProjection {
  const { candidateWorkloadEvidence } = input;
  const { probeTruncated } = candidateWorkloadEvidence;

  const estimatedTotalEntries: TraversalAdmissionProjectionField = buildMeasuredBandField(
    candidateWorkloadEvidence.visitedEntries,
    probeTruncated,
    deriveEntryVolumeBand,
  );

  const estimatedTotalCandidateBytes: TraversalAdmissionProjectionField = buildMeasuredBandField(
    candidateWorkloadEvidence.estimatedCandidateBytes,
    probeTruncated,
    deriveCharVolumeBand,
  );

  const estimatedResponseChars = candidateWorkloadEvidence.estimatedResponseChars;
  const estimatedTotalResponseChars: TraversalAdmissionProjectionField = estimatedResponseChars === null
    ? {
        available: false,
        reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.MATCH_DENSITY_UNKNOWN,
      }
    : {
        band: deriveCharVolumeBand(estimatedResponseChars),
        confidence: probeTruncated
          ? TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.LOW
          : TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.MEDIUM,
        probeTruncated,
      };

  const executionCostModel = input.executionCostModel ?? null;
  const estimatedRemainingDurationMs: TraversalAdmissionProjectionField = executionCostModel === null
    ? {
        available: false,
        reason: TRAVERSAL_ADMISSION_PROJECTION_UNAVAILABLE_REASONS.NO_EXECUTION_COST_MODEL,
      }
    : (() => {
        const estimatedDurationMs = Math.ceil(
          candidateWorkloadEvidence.probeElapsedMs * executionCostModel.executionTimeCostMultiplier
          + candidateWorkloadEvidence.matchedCandidateFiles
            * executionCostModel.estimatedPerCandidateFileCostMs,
        );

        return {
          band: deriveDurationBand(estimatedDurationMs),
          confidence: probeTruncated
            ? TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.LOW
            : TRAVERSAL_ADMISSION_PROJECTION_CONFIDENCES.MEDIUM,
          probeTruncated,
        };
      })();

  return {
    estimatedTotalEntries,
    estimatedTotalCandidateBytes,
    estimatedTotalResponseChars,
    estimatedRemainingDurationMs,
  };
}

const BAND_SEVERITY_BY_VALUE: Record<TraversalAdmissionProjectionBand, number> = {
  small: 0,
  medium: 1,
  large: 2,
  huge: 3,
};

const CONFIDENCE_SEVERITY_BY_VALUE: Record<TraversalAdmissionProjectionConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function aggregateProjectionField(
  fields: TraversalAdmissionProjectionField[],
): TraversalAdmissionProjectionField {
  const widestField = fields.reduce((widest, field) => {
    const widestSeverity = "band" in widest ? BAND_SEVERITY_BY_VALUE[widest.band] : -1;
    const fieldSeverity = "band" in field ? BAND_SEVERITY_BY_VALUE[field.band] : -1;

    return fieldSeverity > widestSeverity ? field : widest;
  });

  if ("band" in widestField) {
    const bandFields = fields.filter(
      (field): field is TraversalAdmissionProjectionBandValue => "band" in field,
    );
    const lowestConfidence = bandFields
      .map((field) => field.confidence)
      .reduce((lowest, confidence) =>
        CONFIDENCE_SEVERITY_BY_VALUE[confidence] < CONFIDENCE_SEVERITY_BY_VALUE[lowest]
          ? confidence
          : lowest,
      );

    return {
      band: widestField.band,
      confidence: lowestConfidence,
      probeTruncated: bandFields.some((field) => field.probeTruncated),
    };
  }

  return widestField;
}

/**
 * Aggregates per-root projections into one whole-request projection.
 *
 * @param projections - Per-root projections; roots without probe evidence contribute nothing.
 * @returns The whole-request projection with the widest band, lowest confidence, and an
 * OR-combined truncation flag per field; `null` when no root contributed a projection
 * (for example on resume passes, which never re-run the blocking probe).
 */
export function aggregateTraversalAdmissionProjections(
  projections: (TraversalAdmissionProjection | null | undefined)[],
): TraversalAdmissionProjection | null {
  const presentProjections = projections.filter(
    (projection): projection is TraversalAdmissionProjection => projection != null,
  );

  if (presentProjections.length === 0) {
    return null;
  }

  return {
    estimatedTotalEntries: aggregateProjectionField(
      presentProjections.map((projection) => projection.estimatedTotalEntries),
    ),
    estimatedTotalCandidateBytes: aggregateProjectionField(
      presentProjections.map((projection) => projection.estimatedTotalCandidateBytes),
    ),
    estimatedTotalResponseChars: aggregateProjectionField(
      presentProjections.map((projection) => projection.estimatedTotalResponseChars),
    ),
    estimatedRemainingDurationMs: aggregateProjectionField(
      presentProjections.map((projection) => projection.estimatedRemainingDurationMs),
    ),
  };
}
