/**
 * Defines the shared runtime capability vocabulary for large-text execution lanes.
 *
 * @remarks
 * This module is the single source of truth for conservative host-tier modeling.
 * Later search, content-read, and count workflows must consume these contracts instead
 * of inventing endpoint-local capability heuristics or optimistic fallback behavior.
 */
export enum SourceReadTier {
  S = "S",
  A = "A",
  B = "B",
  C = "C",
  D = "D",
}

/**
 * Defines the shared throughput tiers for local spool-write work.
 *
 * @remarks
 * Spool-write capacity is modeled separately from source-read capacity so preview-first
 * and task-backed execution can remain conservative when the output side of the host is
 * weaker than the input side.
 */
export enum SpoolWriteTier {
  S = "S",
  A = "A",
  B = "B",
  C = "C",
  D = "D",
}

/**
 * Defines the shared CPU suitability tiers for regex-heavy work.
 *
 * @remarks
 * Regex execution can become CPU-bound even when storage is fast, so the platform keeps a
 * dedicated CPU tier surface instead of assuming that I/O throughput alone is sufficient.
 */
export enum CpuRegexTier {
  S = "S",
  A = "A",
  B = "B",
  C = "C",
  D = "D",
}

/**
 * Describes how confident the platform is in the currently active capability sample.
 *
 * @remarks
 * Confidence is intentionally modeled separately from the throughput tiers so low-confidence
 * environments can be downgraded conservatively without erasing the underlying observations.
 */
export enum RuntimeConfidenceTier {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  UNKNOWN = "UNKNOWN",
}

/**
 * Describes the provenance of the currently active capability sample.
 *
 * @remarks
 * The platform distinguishes static discovery, calibrated probe data, and runtime telemetry
 * so later policy consumers can explain why a conservative fallback was selected.
 */
export enum IoCapabilitySampleOrigin {
  STATIC_DISCOVERY = "STATIC_DISCOVERY",
  CALIBRATED_PROBE = "CALIBRATED_PROBE",
  RUNTIME_TELEMETRY = "RUNTIME_TELEMETRY",
}

/**
 * Canonical minimum source-read throughput thresholds in bytes per second.
 *
 * @remarks
 * Tier `D` is the implicit fallback for values below the `C` threshold or for unknown
 * environments. The detector must not invent alternate tier boundaries.
 */
export const SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND = {
  [SourceReadTier.S]: 2_500_000_000,
  [SourceReadTier.A]: 800_000_000,
  [SourceReadTier.B]: 250_000_000,
  [SourceReadTier.C]: 80_000_000,
} as const;

/**
 * Canonical minimum spool-write throughput thresholds in bytes per second.
 *
 * @remarks
 * Tier `D` remains the implicit fallback for unknown or sub-threshold output capacity.
 * Keeping this table here prevents later consumers from re-declaring the same thresholds.
 */
export const SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND = {
  [SpoolWriteTier.S]: 1_500_000_000,
  [SpoolWriteTier.A]: 500_000_000,
  [SpoolWriteTier.B]: 150_000_000,
  [SpoolWriteTier.C]: 50_000_000,
} as const;

/**
 * Conservative fallback CPU tier for environments that cannot prove a stronger regex lane.
 */
export const DEFAULT_CONSERVATIVE_CPU_REGEX_TIER = CpuRegexTier.D;

/**
 * Shared runtime capability profile consumed by large-text execution policy resolution.
 *
 * @remarks
 * This contract is intentionally explicit so later endpoint handlers, policy resolvers,
 * and orchestration surfaces can consume one server-owned vocabulary.
 */
export interface IoCapabilityProfile {
  /**
   * Effective source-read throughput tier for inbound candidate scanning.
   */
  sourceReadTier: SourceReadTier;

  /**
   * Effective spool-write throughput tier for preview materialization or task handoff payloads.
   */
  spoolWriteTier: SpoolWriteTier;

  /**
   * Effective CPU suitability tier for regex-heavy execution.
   */
  cpuRegexTier: CpuRegexTier;

  /**
   * Confidence tier that describes how trustworthy the current sample is.
   */
  runtimeConfidenceTier: RuntimeConfidenceTier;

  /**
   * Estimated source-read throughput in bytes per second when such evidence is available.
   */
  estimatedSourceReadBytesPerSecond: number | null;

  /**
   * Estimated spool-write throughput in bytes per second when such evidence is available.
   */
  estimatedSpoolWriteBytesPerSecond: number | null;

  /**
   * Provenance of the currently active sample.
   */
  sampleOrigin: IoCapabilitySampleOrigin;

  /**
   * ISO-8601 UTC timestamp describing the newest calibrated or telemetry-backed sample.
   */
  lastCalibratedAt: string | null;
}

/**
 * Conservative fallback profile used when the runtime cannot prove a stronger environment.
 *
 * @remarks
 * The platform intentionally preserves `UNKNOWN` confidence together with the lowest tiers so
 * later policy resolution can stay conservative instead of upgrading itself implicitly.
 */
export const DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE = {
  sourceReadTier: SourceReadTier.D,
  spoolWriteTier: SpoolWriteTier.D,
  cpuRegexTier: DEFAULT_CONSERVATIVE_CPU_REGEX_TIER,
  runtimeConfidenceTier: RuntimeConfidenceTier.UNKNOWN,
  estimatedSourceReadBytesPerSecond: null,
  estimatedSpoolWriteBytesPerSecond: null,
  sampleOrigin: IoCapabilitySampleOrigin.STATIC_DISCOVERY,
  lastCalibratedAt: null,
} as const satisfies IoCapabilityProfile;
