import fs from "fs/promises";
import path from "path";

import { z } from "zod";

/**
 * Canonical disposition literals of one search alias-reference event.
 */
export const SEARCH_ALIAS_REFERENCE_DISPOSITIONS = {
  ALREADY_DELIVERED: "already-delivered",
  OUTSIDE_SCOPE: "outside-scope",
} as const;

/**
 * Disposition of one search alias-reference event.
 */
export type SearchAliasReferenceDisposition =
  (typeof SEARCH_ALIAS_REFERENCE_DISPOSITIONS)[keyof typeof SEARCH_ALIAS_REFERENCE_DISPOSITIONS];

/**
 * Describes one symbolic-link reference encountered by the search traversal.
 *
 * @remarks
 * Alias references are first-class session information: the traversal never follows a link into
 * its content, but the reference itself is surfaced so consumers can map which alias positions
 * point at delivered canonical content.
 */
export interface SearchAliasReferenceEvent {
  /**
   * Root-relative traversal identity of the alias, using forward slashes.
   */
  aliasPath: string;

  /**
   * Root-relative canonical identity of the link target when it stays inside the requested
   * root; the absolute resolved target path when it escapes the requested root.
   */
  targetPath: string;

  /**
   * Whether the referenced content was already delivered in this session or the target lies
   * outside the requested root and is therefore never searched.
   */
  disposition: SearchAliasReferenceDisposition;
}

/**
 * Zod schema for the search alias-reference event surface.
 *
 * @remarks
 * Both search endpoint result schemas embed this schema so the alias-attribution surface stays
 * identical across the family without re-declaring the event shape.
 */
export const SearchAliasReferenceEventSchema = z.object({
  aliasPath: z.string(),
  targetPath: z.string(),
  disposition: z.enum([
    SEARCH_ALIAS_REFERENCE_DISPOSITIONS.ALREADY_DELIVERED,
    SEARCH_ALIAS_REFERENCE_DISPOSITIONS.OUTSIDE_SCOPE,
  ]),
});

/**
 * Persisted alias-attribution state of one search root continuation.
 *
 * @remarks
 * The shape is JSON-serializable because it lives inside the persisted continuation state:
 * canonical identities that already delivered matches in this session, and the alias map that
 * accumulates every registered alias reference per canonical identity.
 */
export interface SearchAliasAttributionState {
  /**
   * Normalized canonical identity keys of files that already delivered at least one match in
   * the current session.
   */
  deliveredCanonicalIdentities: string[];

  /**
   * Alias display paths accumulated per normalized canonical identity key.
   */
  aliasReferencesByCanonicalIdentity: Record<string, string[]>;
}

/**
 * Normalizes one canonical identity path into its comparison key.
 *
 * @remarks
 * Identity keys are separator-normalized everywhere and case-normalized only on Windows, so
 * alias targets computed through `readlink` align with traversal-built relative paths.
 *
 * @param identityPath - Canonical identity path in either separator style.
 * @returns The normalized identity key used for set and map membership.
 */
export function normalizeSearchAliasIdentityKey(identityPath: string): string {
  const posixPath = identityPath.replaceAll("\\", "/");
  return process.platform === "win32" ? posixPath.toLowerCase() : posixPath;
}

/**
 * Creates the empty alias-attribution state for a root that has not seen any alias yet.
 *
 * @returns Empty alias-attribution state.
 */
export function createSearchAliasAttributionState(): SearchAliasAttributionState {
  return {
    deliveredCanonicalIdentities: [],
    aliasReferencesByCanonicalIdentity: {},
  };
}

/**
 * Normalizes the persisted alias-attribution state of a root continuation into a working copy.
 *
 * @remarks
 * This is the boundary-owned normalization point for sessions persisted before the alias
 * surface existed: their absence resolves to the empty state. The returned state is a detached
 * working copy so pass-local registration never mutates the persisted object graph.
 *
 * @param persistedState - Alias-attribution state read from the persisted continuation state.
 * @returns A detached working copy, or the empty state when the persisted state predates the field.
 */
export function resolveSearchAliasAttributionState(
  persistedState: SearchAliasAttributionState | null | undefined,
): SearchAliasAttributionState {
  if (persistedState === null || persistedState === undefined) {
    return createSearchAliasAttributionState();
  }

  return {
    deliveredCanonicalIdentities: [...persistedState.deliveredCanonicalIdentities],
    aliasReferencesByCanonicalIdentity: Object.fromEntries(
      Object.entries(persistedState.aliasReferencesByCanonicalIdentity).map(
        ([identityKey, aliasPaths]) => [identityKey, [...aliasPaths]],
      ),
    ),
  };
}

/**
 * Registers one symbolic-link encounter at the traversal boundary without reading its content.
 *
 * @remarks
 * The pass-local working state is mutated deliberately inside this traversal-side boundary —
 * the same ownership pattern the resume frontier uses for cursor commits. Aliases whose targets
 * escape the requested root produce an outside-scope event and are never registered, because
 * they can never attribute to delivered in-root content.
 *
 * @param options - Alias identity, root context, and the pass-local attribution working state.
 * @returns An alias-reference event when one must surface in the current pass, otherwise null.
 */
export async function registerSearchAliasEncounter(options: {
  aliasAbsolutePath: string;
  aliasRelativePath: string;
  state: SearchAliasAttributionState;
  validRootPath: string;
}): Promise<SearchAliasReferenceEvent | null> {
  const { aliasAbsolutePath, aliasRelativePath, state, validRootPath } = options;

  let rawTarget: string;

  try {
    rawTarget = await fs.readlink(aliasAbsolutePath);
  } catch {
    // An alias that vanished mid-traversal is skipped like any other unreadable entry.
    return null;
  }

  const resolvedTargetPath = path.resolve(path.dirname(aliasAbsolutePath), rawTarget);
  const rootRelativeTarget = path.relative(validRootPath, resolvedTargetPath);
  const targetInsideRoot =
    rootRelativeTarget !== ""
    && !rootRelativeTarget.startsWith("..")
    && !path.isAbsolute(rootRelativeTarget);

  if (!targetInsideRoot) {
    return {
      aliasPath: aliasRelativePath,
      targetPath: resolvedTargetPath,
      disposition: SEARCH_ALIAS_REFERENCE_DISPOSITIONS.OUTSIDE_SCOPE,
    };
  }

  const canonicalRelativeTarget = rootRelativeTarget.split(path.sep).join("/");
  const targetIdentityKey = normalizeSearchAliasIdentityKey(canonicalRelativeTarget);
  const existingAliasPaths = state.aliasReferencesByCanonicalIdentity[targetIdentityKey] ?? [];

  if (!existingAliasPaths.includes(aliasRelativePath)) {
    state.aliasReferencesByCanonicalIdentity[targetIdentityKey] = [
      ...existingAliasPaths,
      aliasRelativePath,
    ];
  }

  if (state.deliveredCanonicalIdentities.includes(targetIdentityKey)) {
    return {
      aliasPath: aliasRelativePath,
      targetPath: canonicalRelativeTarget,
      disposition: SEARCH_ALIAS_REFERENCE_DISPOSITIONS.ALREADY_DELIVERED,
    };
  }

  return null;
}

/**
 * Marks one canonical file as delivered in the current session and returns its accumulated
 * alias attributions.
 *
 * @remarks
 * Delivery marking and attribution lookup are paired deliberately: every delivery point needs
 * the accumulated alias list for the emitted matches, and the mark must precede any later
 * alias encounter so the exactly-once event contract holds.
 *
 * @param options - Canonical root-relative identity of the delivered file and the working state.
 * @returns Alias display paths accumulated for the delivered canonical identity.
 */
export function recordSearchAliasCanonicalDelivery(options: {
  canonicalRelativePath: string;
  state: SearchAliasAttributionState;
}): string[] {
  const { canonicalRelativePath, state } = options;
  const identityKey = normalizeSearchAliasIdentityKey(canonicalRelativePath);

  if (!state.deliveredCanonicalIdentities.includes(identityKey)) {
    state.deliveredCanonicalIdentities = [...state.deliveredCanonicalIdentities, identityKey];
  }

  return state.aliasReferencesByCanonicalIdentity[identityKey] ?? [];
}

/**
 * Collects the union of alias attributions carried by one file group of matches.
 *
 * @param matches - Matches grouped under one file label on the text surface.
 * @returns Deterministically ordered unique alias display paths for the file group.
 */
export function collectSearchAliasFileGroupAttributions(
  matches: ReadonlyArray<{ readonly attributedAliases?: readonly string[] }>,
): string[] {
  const attributions = new Set<string>();

  for (const match of matches) {
    for (const attributedAlias of match.attributedAliases ?? []) {
      attributions.add(attributedAlias);
    }
  }

  return [...attributions];
}

/**
 * Formats the alias-reference events of one pass into the caller-visible text surface.
 *
 * @param aliasReferences - Alias-reference events fired during the current pass.
 * @returns The formatted alias-reference block, or null when no events fired.
 */
export function formatSearchAliasReferenceEvents(
  aliasReferences: readonly SearchAliasReferenceEvent[],
): string | null {
  if (aliasReferences.length === 0) {
    return null;
  }

  const lines = aliasReferences.map((aliasReference) => {
    const dispositionText =
      aliasReference.disposition === SEARCH_ALIAS_REFERENCE_DISPOSITIONS.ALREADY_DELIVERED
        ? "already delivered in this session — no new match"
        : "not searched — link target outside the requested root";

    return `  ${aliasReference.aliasPath} → ${aliasReference.targetPath} (${dispositionText})`;
  });

  return ["Alias references:", ...lines].join("\n");
}
