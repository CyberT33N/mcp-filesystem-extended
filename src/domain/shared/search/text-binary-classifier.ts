import {
  classifyInspectionContentState,
  INSPECTION_CONTENT_OPERATION_LITERALS,
  INSPECTION_CONTENT_STATE_LITERALS,
  type InspectionContentStateClassification,
  resolveInspectionContentOperationCapability,
  type InspectionContentStateInput,
} from "./inspection-content-state";

/**
 * Input contract for the shared text-versus-binary compatibility bridge.
 */
export interface TextBinaryClassificationInput extends InspectionContentStateInput {}

/**
 * Shared classification result for text-eligible search surfaces.
 */
export interface TextBinaryClassification
  extends InspectionContentStateClassification {
  /**
   * Indicates whether the richer shared state keeps the candidate surface eligible for
   * text-oriented execution.
   */
  isTextEligible: boolean;

  /**
   * Compact explanation of the decisive classification outcome.
   */
  classificationReason: string;

  /**
   * Indicates whether a text-oriented extension hint influenced the derived compatibility result.
   */
  usedAssistList: boolean;

  /**
   * Indicates whether the generic content probe influenced the outcome.
   */
  usedContentProbe: boolean;
}

/**
 * Classifies whether one candidate path is eligible for text-oriented search work.
 *
 * @remarks
 * The classifier combines a small positive assist list, explicit binary/container deny classes,
 * and a generic content probe so later search consumers avoid both exhaustive allow lists and
 * brittle extension-only routing.
 *
 * @param input - Candidate path and optional content sample for conservative classification.
 * @returns Shared classification output that later search and count handlers may consume.
 */
export function classifyTextBinarySurface(
  input: TextBinaryClassificationInput,
): TextBinaryClassification {
  const stateClassification = classifyInspectionContentState(input);
  const searchCapability = resolveInspectionContentOperationCapability(
    stateClassification,
    INSPECTION_CONTENT_OPERATION_LITERALS.SEARCH_TEXT,
  );

  return {
    ...stateClassification,
    classificationReason: searchCapability.reason,
    isTextEligible: searchCapability.isAllowed,
    usedAssistList: stateClassification.evidence.usedTextExtensionHint,
    usedContentProbe: stateClassification.evidence.usedContentProbe,
  };
}
