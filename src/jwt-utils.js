// === JWT Utilities for Antigravity-Deck ===
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Token configuration
const ACCESS_TOKEN_EXPIRY = '15m';   // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';   // 7 days

// Get secrets from environment
const JWT_SECRET = process.env.JWT_SECRET || '';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set - JWT authentication will not work');
}

/**
 * Generate access and refresh token pair
 * @param {string} userId - User identifier
 * @returns {{ accessToken: string, refreshToken: string, accessTokenExpiry: number, refreshTokenExpiry: number }}
 */
function generateTokens(userId) {
  const accessTokenId = crypto.randomUUID();
  const refreshTokenId = crypto.randomUUID();
  
  const now = Math.floor(Date.now() / 1000);
  const accessExpiry = now + (15 * 60); // 15 minutes
  const refreshExpiry = now + (7 * 24 * 60 * 60); // 7 days
  
  const accessToken = jwt.sign(
    {
      sub: userId,           // Subject (user ID)
      jti: accessTokenId,    // JWT ID (for revocation)
      type: 'access',
      iat: now,
      exp: accessExpiry
    },
    JWT_SECRET,
    { algorithm: 'HS256' }
  );
  
  const refreshToken = jwt.sign(
    {
      sub: userId,
      jti: refreshTokenId,
      type: 'refresh',
      iat: now,
      exp: refreshExpiry
    },
    REFRESH_TOKEN_SECRET,
    { algorithm: 'HS256' }
  );
  
  return {
    accessToken,
    refreshToken,
    accessTokenExpiry: accessExpiry,
    refreshTokenExpiry: refreshExpiry
  };
}

/**
 * Verify and decode access token
 * @param {string} token - JWT access token
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });
    
    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const error = new Error('Token expired');
      error.code = 'TOKEN_EXPIRED';
      throw error;
    }
    if (err.name === 'JsonWebTokenError') {
      const error = new Error('Invalid token');
      error.code = 'TOKEN_INVALID';
      throw error;
    }
    throw err;
  }
}

/**
 * Verify and decode refresh token
 * @param {string} token - JWT refresh token
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET, {
      algorithms: ['HS256']
    });
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      const error = new Error('Refresh token expired');
      error.code = 'REFRESH_EXPIRED';
      throw error;
    }
    if (err.name === 'JsonWebTokenError') {
      const error = new Error('Invalid refresh token');
      error.code = 'REFRESH_INVALID';
      throw error;
    }
    throw err;
  }
}

/**
 * Generate CSRF token
 * @returns {string} Random CSRF token
 */
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  generateCsrfToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
};
