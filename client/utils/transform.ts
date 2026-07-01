/**
 * Contact data transformation utilities
 * Handles format conversion and normalization for cross-platform compatibility
 */

// Platform-specific field mapping constants
const FIELD_MAPPINGS = {
  android: {
    displayName: 'name',
    phoneType: 'mimeType',
    avatarField: 'photoUri',
  },
  ios: {
    displayName: 'contactName',
    phoneType: 'label',
    avatarField: 'imageData',
  },
} as const;

type Platform = keyof typeof FIELD_MAPPINGS;

/**
 * Normalize contact fields across platforms
 * Ensures consistent field names regardless of source platform
 */
export function normalizeContactFields(
  contact: Record<string, unknown>,
  sourcePlatform: Platform = 'android'
): Record<string, unknown> {
  const mapping = FIELD_MAPPINGS[sourcePlatform];
  const normalized = { ...contact };
  
  // Apply field name transformations
  if (mapping.displayName in normalized) {
    normalized.canonicalName = normalized[mapping.displayName];
  }
  
  // Normalize phone number format (E.164 when possible)
  if (typeof normalized.phone === 'string') {
    normalized.phone = normalizePhoneNumber(normalized.phone);
  }
  
  return normalized;
}

/**
 * Phone number normalization following E.164 guidelines
 * Strips non-numeric characters and applies country code heuristics
 */
function normalizePhoneNumber(phone: string): string {
  // Strip all non-numeric characters except leading +
  const hasPlus = phone.startsWith('+');
  const digits = phone.replace(/\D/g, '');
  
  // Apply Chinese mainland number validation
  if (digits.length === 11 && digits.startsWith('1')) {
    return hasPlus ? `+86${digits}` : digits;
  }
  
  // For international numbers, preserve the format
  if (hasPlus) {
    return `+${digits}`;
  }
  
  return digits;
}

/**
 * Calculate similarity score between two contact records
 * Used for fuzzy matching during import deduplication
 */
export function calculateContactSimilarity(
  a: { name: string; phone?: string },
  b: { name: string; phone?: string }
): number {
  let score = 0;
  
  // Phone exact match: high weight
  if (a.phone && b.phone && a.phone === b.phone) {
    score += 0.7;
  } else if (a.phone && b.phone) {
    // Partial phone match (last 7 digits)
    const aLast7 = a.phone.slice(-7);
    const bLast7 = b.phone.slice(-7);
    if (aLast7 === bLast7) {
      score += 0.4;
    }
  }
  
  // Name similarity using character overlap
  if (a.name && b.name) {
    const aChars = new Set(a.name.split(''));
    const bChars = new Set(b.name.split(''));
    const intersection = [...aChars].filter(c => bChars.has(c)).length;
    const union = new Set([...aChars, ...bChars]).size;
    const nameSimilarity = union > 0 ? intersection / union : 0;
    score += nameSimilarity * 0.3;
  }
  
  return Math.min(score, 1.0);
}

/**
 * Batch transform contacts for export
 * Applies platform-specific formatting rules
 */
export function transformForExport(
  contacts: Array<Record<string, unknown>>,
  targetPlatform: Platform = 'android'
): Array<Record<string, unknown>> {
  const mapping = FIELD_MAPPINGS[targetPlatform];
  
  return contacts.map(contact => {
    const transformed = { ...contact };
    
    // Apply platform-specific field names
    if ('canonicalName' in transformed) {
      transformed[mapping.displayName] = transformed.canonicalName;
      delete transformed.canonicalName;
    }
    
    return transformed;
  });
}
