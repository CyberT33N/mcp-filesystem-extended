import {
  CpuRegexTier,
  DEFAULT_CONSERVATIVE_CPU_REGEX_TIER,
  DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE,
  type IoCapabilityProfile,
  IoCapabilitySampleOrigin,
  PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE,
  RuntimeConfidenceTier,
  SourceReadTier,
  SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND,
  SpoolWriteTier,
  SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND,
} from "@domain/shared/runtime/io-capability-profile";

/**
 * Static discovery inputs collected without calibrated probes or request-path benchmarks.
 */
export interface IoCapabilityStaticDiscoveryInput {
  /**
   * Conservative source-read estimate gathered during startup discovery.
   */
  estimatedSourceReadBytesPerSecond?: number;

  /**
   * Conservative spool-write estimate gathered during startup discovery.
   */
  estimatedSpoolWriteBytesPerSecond?: number;

  /**
   * Optional CPU suitability hint gathered from safe startup discovery.
   */
  detectedCpuRegexTier?: CpuRegexTier;
}

/**
 * Calibrated probe inputs gathered outside the request path.
 */
export interface IoCapabilityCalibrationInput {
  /**
   * Calibrated source-read throughput in bytes per second.
   */
  measuredSourceReadBytesPerSecond?: number;

  /**
   * Calibrated spool-write throughput in bytes per second.
   */
  measuredSpoolWriteBytesPerSecond?: number;

  /**
   * CPU regex tier derived from offline calibration.
   */
  detectedCpuRegexTier?: CpuRegexTier;

  /**
   * ISO-8601 UTC timestamp that identifies when the calibration sample was captured.
   */
  calibratedAt?: string;
}

/**
 * Runtime telemetry inputs that refine an already detected profile.
 */
export interface IoCapabilityTelemetryUpdate {
  /**
   * Observed source-read throughput in bytes per second.
   */
  observedSourceReadBytesPerSecond?: number;

  /**
   * Observed spool-write throughput in bytes per second.
   */
  observedSpoolWriteBytesPerSecond?: number;

  /**
   * CPU regex tier inferred from telemetry-aware runtime signals.
   */
  detectedCpuRegexTier?: CpuRegexTier;

  /**
   * ISO-8601 UTC timestamp that identifies when the telemetry snapshot was captured.
   */
  observedAt?: string;
}

/**
 * Composite detector input that keeps static discovery, calibrated probes, and telemetry separate.
 */
export interface IoCapabilityDetectorInput {
  /**
   * Startup-safe discovery inputs.
   */
  staticDiscovery?: IoCapabilityStaticDiscoveryInput;

  /**
   * Offline or startup calibration inputs.
   */
  calibration?: IoCapabilityCalibrationInput;

  /**
   * Runtime telemetry inputs that should override older evidence conservatively.
   */
  telemetry?: IoCapabilityTelemetryUpdate;
}

function normalizePositiveNumber(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function resolveStaticDiscoveryInput(
  input: IoCapabilityDetectorInput,
): IoCapabilityStaticDiscoveryInput | undefined {
  if (input.staticDiscovery !== undefined) {
    return input.staticDiscovery;
  }

  return {
    estimatedSourceReadBytesPerSecond:
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE.estimatedSourceReadBytesPerSecond
      ?? undefined,
    estimatedSpoolWriteBytesPerSecond:
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE.estimatedSpoolWriteBytesPerSecond
      ?? undefined,
    detectedCpuRegexTier:
      PROVEN_LOCAL_STATIC_DISCOVERY_IO_CAPABILITY_PROFILE.cpuRegexTier,
  };
}

function hasStaticDiscoveryData(input: IoCapabilityStaticDiscoveryInput | undefined): boolean {
  return (
    normalizePositiveNumber(input?.estimatedSourceReadBytesPerSecond) !== null
    || normalizePositiveNumber(input?.estimatedSpoolWriteBytesPerSecond) !== null
    || input?.detectedCpuRegexTier !== undefined
  );
}

function hasCalibrationData(input: IoCapabilityCalibrationInput | undefined): boolean {
  return (
    normalizePositiveNumber(input?.measuredSourceReadBytesPerSecond) !== null
    || normalizePositiveNumber(input?.measuredSpoolWriteBytesPerSecond) !== null
    || input?.detectedCpuRegexTier !== undefined
  );
}

function hasTelemetryData(input: IoCapabilityTelemetryUpdate | undefined): boolean {
  return (
    normalizePositiveNumber(input?.observedSourceReadBytesPerSecond) !== null
    || normalizePositiveNumber(input?.observedSpoolWriteBytesPerSecond) !== null
    || input?.detectedCpuRegexTier !== undefined
  );
}

function classifySourceReadTier(bytesPerSecond: number | null): SourceReadTier {
  if (bytesPerSecond === null) {
    return SourceReadTier.D;
  }

  if (bytesPerSecond >= SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND[SourceReadTier.S]) {
    return SourceReadTier.S;
  }

  if (bytesPerSecond >= SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND[SourceReadTier.A]) {
    return SourceReadTier.A;
  }

  if (bytesPerSecond >= SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND[SourceReadTier.B]) {
    return SourceReadTier.B;
  }

  if (bytesPerSecond >= SOURCE_READ_TIER_MINIMUM_BYTES_PER_SECOND[SourceReadTier.C]) {
    return SourceReadTier.C;
  }

  return SourceReadTier.D;
}

function classifySpoolWriteTier(bytesPerSecond: number | null): SpoolWriteTier {
  if (bytesPerSecond === null) {
    return SpoolWriteTier.D;
  }

  if (bytesPerSecond >= SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND[SpoolWriteTier.S]) {
    return SpoolWriteTier.S;
  }

  if (bytesPerSecond >= SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND[SpoolWriteTier.A]) {
    return SpoolWriteTier.A;
  }

  if (bytesPerSecond >= SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND[SpoolWriteTier.B]) {
    return SpoolWriteTier.B;
  }

  if (bytesPerSecond >= SPOOL_WRITE_TIER_MINIMUM_BYTES_PER_SECOND[SpoolWriteTier.C]) {
    return SpoolWriteTier.C;
  }

  return SpoolWriteTier.D;
}

function resolveSampleOrigin(input: IoCapabilityDetectorInput): IoCapabilitySampleOrigin {
  if (hasTelemetryData(input.telemetry)) {
    return IoCapabilitySampleOrigin.RUNTIME_TELEMETRY;
  }

  if (hasCalibrationData(input.calibration)) {
    return IoCapabilitySampleOrigin.CALIBRATED_PROBE;
  }

  return IoCapabilitySampleOrigin.STATIC_DISCOVERY;
}

function resolveRuntimeConfidenceTier(input: IoCapabilityDetectorInput): RuntimeConfidenceTier {
  const staticDiscoveryInput = resolveStaticDiscoveryInput(input);

  if (hasTelemetryData(input.telemetry)) {
    return RuntimeConfidenceTier.HIGH;
  }

  if (hasCalibrationData(input.calibration)) {
    return RuntimeConfidenceTier.MEDIUM;
  }

  if (hasStaticDiscoveryData(staticDiscoveryInput)) {
    return RuntimeConfidenceTier.LOW;
  }

  return RuntimeConfidenceTier.UNKNOWN;
}

function resolveSourceReadBytesPerSecond(input: IoCapabilityDetectorInput): number | null {
  const staticDiscoveryInput = resolveStaticDiscoveryInput(input);

  return normalizePositiveNumber(input.telemetry?.observedSourceReadBytesPerSecond)
    ?? normalizePositiveNumber(input.calibration?.measuredSourceReadBytesPerSecond)
    ?? normalizePositiveNumber(staticDiscoveryInput?.estimatedSourceReadBytesPerSecond)
    ?? DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE.estimatedSourceReadBytesPerSecond;
}

function resolveSpoolWriteBytesPerSecond(input: IoCapabilityDetectorInput): number | null {
  const staticDiscoveryInput = resolveStaticDiscoveryInput(input);

  return normalizePositiveNumber(input.telemetry?.observedSpoolWriteBytesPerSecond)
    ?? normalizePositiveNumber(input.calibration?.measuredSpoolWriteBytesPerSecond)
    ?? normalizePositiveNumber(staticDiscoveryInput?.estimatedSpoolWriteBytesPerSecond)
    ?? DEFAULT_CONSERVATIVE_IO_CAPABILITY_PROFILE.estimatedSpoolWriteBytesPerSecond;
}

function resolveCpuRegexTier(input: IoCapabilityDetectorInput): CpuRegexTier {
  const staticDiscoveryInput = resolveStaticDiscoveryInput(input);

  return input.telemetry?.detectedCpuRegexTier
    ?? input.calibration?.detectedCpuRegexTier
    ?? staticDiscoveryInput?.detectedCpuRegexTier
    ?? DEFAULT_CONSERVATIVE_CPU_REGEX_TIER;
}

function resolveLastCalibratedAt(input: IoCapabilityDetectorInput): string | null {
  if (hasTelemetryData(input.telemetry)) {
    return input.telemetry?.observedAt ?? null;
  }

  if (hasCalibrationData(input.calibration)) {
    return input.calibration?.calibratedAt ?? null;
  }

  return null;
}

/**
 * Detects the current runtime I/O capability profile without performing per-request probes.
 *
 * @remarks
 * The zero-argument path materializes the proven local static-discovery floor for the application-
 * owned Node.js plus native-search runtime. Callers that truly cannot prove their startup
 * environment may still supply an explicit unresolved `staticDiscovery` surface and keep the
 * all-`D` and `UNKNOWN` fallback profile.
 *
 * @param input - Structured static-discovery, calibration, and telemetry inputs.
 * @returns A conservative runtime capability profile that later execution policy resolution can consume.
 */
export function detectIoCapabilityProfile(
  input: IoCapabilityDetectorInput = {},
): IoCapabilityProfile {
  const estimatedSourceReadBytesPerSecond = resolveSourceReadBytesPerSecond(input);
  const estimatedSpoolWriteBytesPerSecond = resolveSpoolWriteBytesPerSecond(input);

  return {
    sourceReadTier: classifySourceReadTier(estimatedSourceReadBytesPerSecond),
    spoolWriteTier: classifySpoolWriteTier(estimatedSpoolWriteBytesPerSecond),
    cpuRegexTier: resolveCpuRegexTier(input),
    runtimeConfidenceTier: resolveRuntimeConfidenceTier(input),
    estimatedSourceReadBytesPerSecond,
    estimatedSpoolWriteBytesPerSecond,
    sampleOrigin: resolveSampleOrigin(input),
    lastCalibratedAt: resolveLastCalibratedAt(input),
  };
}

/**
 * Refines an existing runtime capability profile with runtime telemetry.
 *
 * @param currentProfile - The last conservative capability profile already in use.
 * @param telemetry - Structured runtime telemetry that may refine the active profile.
 * @returns An updated profile that prefers telemetry while preserving conservative fallback semantics.
 */
export function mergeIoCapabilityRuntimeTelemetry(
  currentProfile: IoCapabilityProfile,
  telemetry: IoCapabilityTelemetryUpdate,
): IoCapabilityProfile {
  if (!hasTelemetryData(telemetry)) {
    return currentProfile;
  }

  const estimatedSourceReadBytesPerSecond =
    normalizePositiveNumber(telemetry.observedSourceReadBytesPerSecond)
    ?? currentProfile.estimatedSourceReadBytesPerSecond;
  const estimatedSpoolWriteBytesPerSecond =
    normalizePositiveNumber(telemetry.observedSpoolWriteBytesPerSecond)
    ?? currentProfile.estimatedSpoolWriteBytesPerSecond;

  return {
    sourceReadTier: classifySourceReadTier(estimatedSourceReadBytesPerSecond),
    spoolWriteTier: classifySpoolWriteTier(estimatedSpoolWriteBytesPerSecond),
    cpuRegexTier: telemetry.detectedCpuRegexTier ?? currentProfile.cpuRegexTier,
    runtimeConfidenceTier: RuntimeConfidenceTier.HIGH,
    estimatedSourceReadBytesPerSecond,
    estimatedSpoolWriteBytesPerSecond,
    sampleOrigin: IoCapabilitySampleOrigin.RUNTIME_TELEMETRY,
    lastCalibratedAt: telemetry.observedAt ?? currentProfile.lastCalibratedAt,
  };
}
