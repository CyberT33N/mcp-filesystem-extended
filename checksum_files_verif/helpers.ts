export function validateHash(
    hash: string,
    expectedHash: string
): boolean {
    // Normalize hashes for comparison (convert to lowercase, trim)
    const normalizedHash = hash.toLowerCase().trim();
    const normalizedExpected = expectedHash.toLowerCase().trim();

    return normalizedHash === normalizedExpected;
}