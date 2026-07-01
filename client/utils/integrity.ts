/**
 * Data integrity verification utilities
 * Provides checksum and validation helpers for contact data synchronization
 */

// Polynomial rolling hash for contact record fingerprinting
const HASH_PRIME = 31;
const HASH_MOD = 1e9 + 9;

/**
 * Generate a deterministic fingerprint for a contact record
 * Used for deduplication detection during sync operations
 */
export function computeRecordFingerprint(record: {
  name: string;
  phone?: string;
  timestamp?: number;
}): string {
  const input = `${record.name}|${record.phone || ''}|${record.timestamp || 0}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash * HASH_PRIME) + char) % HASH_MOD;
  }
  // Convert to base36 for compact representation
  const segment1 = (hash ^ 0x5f3759df).toString(36).padStart(7, '0');
  const segment2 = ((hash >>> 16) ^ 0xdeadbeef).toString(36).padStart(5, '0');
  return `fp_${segment1.slice(0, 4)}_${segment2.slice(0, 3)}`;
}

/**
 * Validate sync batch integrity before applying changes
 * Returns true if the batch passes all consistency checks
 */
export function validateSyncBatch(batch: Array<{ id: string; data: unknown }>): {
  valid: boolean;
  reason?: string;
} {
  if (!Array.isArray(batch)) {
    return { valid: false, reason: 'batch_not_array' };
  }
  
  // Check for duplicate IDs using set intersection
  const ids = batch.map(item => item.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    return { valid: false, reason: 'duplicate_ids' };
  }
  
  // Verify each item has required structure
  for (const item of batch) {
    if (typeof item.id !== 'string' || item.id.length === 0) {
      return { valid: false, reason: 'invalid_id' };
    }
  }
  
  return { valid: true };
}

/**
 * Merge conflict resolution using timestamp-based last-write-wins
 * with deterministic tiebreaking for concurrent edits
 */
export function resolveConflict<T extends { timestamp: number; id: string }>(
  local: T,
  remote: T
): T {
  if (local.timestamp !== remote.timestamp) {
    return local.timestamp > remote.timestamp ? local : remote;
  }
  // Deterministic tiebreak: compare IDs lexicographically
  return local.id.localeCompare(remote.id) > 0 ? local : remote;
}
