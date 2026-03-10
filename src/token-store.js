// === Refresh Token Store (In-Memory) ===
// NOTE: This is a simple in-memory store for MVP.
// For production with multiple instances, migrate to Redis.

/**
 * Refresh token storage
 * Structure: Map<jti, { userId, expiresAt, revoked, createdAt }>
 */
const refreshTokens = new Map();

/**
 * Store a refresh token
 * @param {string} jti - JWT ID (unique token identifier)
 * @param {string} userId - User ID who owns this token
 * @param {number} expiresAt - Unix timestamp when token expires
 */
function storeRefreshToken(jti, userId, expiresAt) {
  refreshTokens.set(jti, {
    userId,
    expiresAt,
    revoked: false,
    createdAt: Date.now()
  });
  
  // Auto-cleanup expired tokens (run periodically)
  scheduleCleanup();
}

/**
 * Atomically consume a refresh token (validate and revoke in one operation)
 * This prevents race conditions where two concurrent requests could both pass validation
 * @param {string} jti - JWT ID
 * @returns {{ valid: boolean, userId?: string, reason?: string }}
 */
function consumeRefreshToken(jti) {
  const token = refreshTokens.get(jti);
  
  if (!token) {
    return { valid: false, reason: 'TOKEN_NOT_FOUND' };
  }
  
  if (token.revoked) {
    return { valid: false, reason: 'TOKEN_ALREADY_REVOKED', userId: token.userId };
  }
  
  if (token.expiresAt * 1000 < Date.now()) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }
  
  // Atomically mark as revoked before returning success
  token.revoked = true;
  token.revokedAt = Date.now();
  
  return { valid: true, userId: token.userId };
}

/**
 * Get refresh token data
 * @param {string} jti - JWT ID
 * @returns {object|null} Token data or null if not found
 */
function getRefreshToken(jti) {
  return refreshTokens.get(jti) || null;
}

/**
 * Revoke a specific refresh token
 * @param {string} jti - JWT ID
 * @returns {boolean} True if token was revoked, false if not found
 */
function revokeRefreshToken(jti) {
  const token = refreshTokens.get(jti);
  
  if (!token) {
    return false;
  }
  
  token.revoked = true;
  token.revokedAt = Date.now();
  
  return true;
}

/**
 * Revoke all refresh tokens for a user
 * Used when detecting token reuse (security incident)
 * @param {string} userId - User ID
 * @returns {number} Number of tokens revoked
 */
function revokeAllUserTokens(userId) {
  let count = 0;
  
  for (const [jti, token] of refreshTokens.entries()) {
    if (token.userId === userId && !token.revoked) {
      token.revoked = true;
      token.revokedAt = Date.now();
      count++;
    }
  }
  
  return count;
}

/**
 * Clean up expired and old revoked tokens
 * Runs automatically every hour
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [jti, token] of refreshTokens.entries()) {
    // Remove if expired
    if (token.expiresAt * 1000 < now) {
      refreshTokens.delete(jti);
      cleaned++;
      continue;
    }
    
    // Remove if revoked and older than 24 hours
    if (token.revoked && token.revokedAt && (now - token.revokedAt) > 24 * 60 * 60 * 1000) {
      refreshTokens.delete(jti);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[TokenStore] Cleaned up ${cleaned} expired/old tokens`);
  }
}

// Schedule periodic cleanup
let cleanupInterval = null;

function scheduleCleanup() {
  if (cleanupInterval) {
    return; // Already scheduled
  }
  
  // Run cleanup every hour
  cleanupInterval = setInterval(() => {
    cleanupExpiredTokens();
  }, 60 * 60 * 1000);
  
  // Don't prevent process from exiting
  cleanupInterval.unref();
}

/**
 * Get statistics about token store
 * @returns {object} Store statistics
 */
function getStats() {
  let active = 0;
  let revoked = 0;
  let expired = 0;
  const now = Date.now();
  
  for (const token of refreshTokens.values()) {
    if (token.expiresAt * 1000 < now) {
      expired++;
    } else if (token.revoked) {
      revoked++;
    } else {
      active++;
    }
  }
  
  return {
    total: refreshTokens.size,
    active,
    revoked,
    expired
  };
}

module.exports = {
  storeRefreshToken,
  consumeRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  getStats
};
