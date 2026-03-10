// === Authentication Routes for JWT ===
const express = require('express');
const crypto = require('crypto');
const { generateTokens, verifyRefreshToken, generateCsrfToken } = require('./jwt-utils');
const { 
  storeRefreshToken, 
  consumeRefreshToken,
  getRefreshToken,
  revokeRefreshToken, 
  revokeAllUserTokens 
} = require('./token-store');

const router = express.Router();

// Get AUTH_KEY from environment (used for initial login)
const AUTH_KEY = process.env.AUTH_KEY || '';

// Precompute fixed-length hash of AUTH_KEY to prevent timing attacks
// This ensures all comparisons are constant-time regardless of input length
const AUTH_KEY_HASH = AUTH_KEY ? crypto.createHash('sha256').update(AUTH_KEY).digest() : Buffer.alloc(32);

/**
 * Set authentication cookies
 * @param {object} res - Express response object
 * @param {string} accessToken - JWT access token
 * @param {string} refreshToken - JWT refresh token
 * @param {string} csrfToken - CSRF token
 */
function setAuthCookies(res, accessToken, refreshToken, csrfToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Access token - short-lived, for API authentication
  res.cookie('access_token', accessToken, {
    httpOnly: true,           // Prevents XSS
    secure: isProduction,     // HTTPS only in production
    sameSite: 'strict',       // CSRF protection
    path: '/',
    maxAge: 15 * 60 * 1000    // 15 minutes
  });
  
  // Refresh token - longer-lived, for token refresh only
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',        // Limited scope
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  });
  
  // CSRF token - readable by JavaScript (not httpOnly)
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,          // Client needs to read this
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000  // Same as refresh token
  });
}

/**
 * Clear authentication cookies
 * @param {object} res - Express response object
 */
function clearAuthCookies(res) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.clearCookie('csrf_token', { path: '/' });
}

/**
 * POST /api/auth/login
 * Exchange AUTH_KEY for JWT tokens
 * 
 * Body: { authKey: string }
 * Response: { success: true, csrfToken: string, expiresIn: number }
 */
router.post('/login', (req, res) => {
  const { authKey } = req.body;
  
  if (!AUTH_KEY) {
    return res.status(500).json({ 
      error: 'Server authentication not configured',
      code: 'AUTH_NOT_CONFIGURED'
    });
  }
  
  if (!authKey) {
    return res.status(400).json({ 
      error: 'Auth key required',
      code: 'AUTH_KEY_REQUIRED'
    });
  }
  
  // Timing-safe comparison using fixed-length hash digests
  // Hash the input to same length as stored hash, then compare
  // This prevents timing attacks that could determine AUTH_KEY length
  try {
    const inputHash = crypto.createHash('sha256').update(authKey).digest();
    
    if (!crypto.timingSafeEqual(inputHash, AUTH_KEY_HASH)) {
      return res.status(401).json({ 
        error: 'Invalid auth key',
        code: 'INVALID_AUTH_KEY'
      });
    }
  } catch (e) {
    return res.status(401).json({ 
      error: 'Invalid auth key',
      code: 'INVALID_AUTH_KEY'
    });
  }
  
  // Auth key is valid - generate JWT tokens
  const userId = 'default-user'; // Single-user system for now
  const { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry } = generateTokens(userId);
  
  // Generate CSRF token
  const csrfToken = generateCsrfToken();
  
  // Store refresh token for validation
  const refreshDecoded = verifyRefreshToken(refreshToken);
  storeRefreshToken(refreshDecoded.jti, userId, refreshTokenExpiry);
  
  // Set cookies
  setAuthCookies(res, accessToken, refreshToken, csrfToken);
  
  console.log(`[Auth] User logged in: ${userId}`);
  
  res.json({
    success: true,
    csrfToken,
    expiresIn: 15 * 60  // Access token expiry in seconds
  });
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token and issue new access token
 * 
 * Response: { success: true, expiresIn: number }
 */
router.post('/refresh', (req, res) => {
  const oldRefreshToken = req.cookies.refresh_token;
  
  if (!oldRefreshToken) {
    return res.status(401).json({ 
      error: 'No refresh token provided',
      code: 'NO_REFRESH_TOKEN'
    });
  }
  
  let decoded;
  try {
    decoded = verifyRefreshToken(oldRefreshToken);
  } catch (err) {
    return res.status(401).json({ 
      error: err.message,
      code: err.code || 'REFRESH_INVALID'
    });
  }
  
  // Atomically consume the refresh token (validates and revokes in one operation)
  const consumeResult = consumeRefreshToken(decoded.jti);
  
  if (!consumeResult.valid) {
    if (consumeResult.reason === 'TOKEN_ALREADY_REVOKED') {
      // Token reuse detected - potential security incident
      console.warn(`[Auth] Refresh token reuse detected for user: ${consumeResult.userId || decoded.sub}`);
      
      // Revoke all user tokens
      const revokedCount = revokeAllUserTokens(consumeResult.userId || decoded.sub);
      console.warn(`[Auth] Revoked ${revokedCount} tokens for user: ${consumeResult.userId || decoded.sub}`);
      
      // Clear cookies
      clearAuthCookies(res);
      
      return res.status(401).json({ 
        error: 'Token reuse detected - all sessions revoked',
        code: 'TOKEN_REUSE'
      });
    }
    
    // Other validation failures (expired, not found)
    return res.status(401).json({ 
      error: `Refresh token ${consumeResult.reason.toLowerCase().replace(/_/g, ' ')}`,
      code: consumeResult.reason
    });
  }
  
  // Token consumed successfully - generate new token pair
  const { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry } = generateTokens(decoded.sub);
  
  // Store new refresh token
  const newDecoded = verifyRefreshToken(refreshToken);
  storeRefreshToken(newDecoded.jti, decoded.sub, refreshTokenExpiry);
  
  // Get existing CSRF token (don't rotate on refresh)
  const csrfToken = req.cookies.csrf_token || generateCsrfToken();
  
  // Set new cookies
  setAuthCookies(res, accessToken, refreshToken, csrfToken);
  
  console.log(`[Auth] Token refreshed for user: ${decoded.sub}`);
  
  res.json({
    success: true,
    expiresIn: 15 * 60  // Access token expiry in seconds
  });
});

/**
 * POST /api/auth/logout
 * Revoke refresh token and clear cookies
 * 
 * Response: { success: true }
 */
router.post('/logout', (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      
      // Revoke the refresh token
      const revoked = revokeRefreshToken(decoded.jti);
      
      if (revoked) {
        console.log(`[Auth] User logged out: ${decoded.sub}`);
      }
    } catch (err) {
      // Token invalid or expired - still clear cookies
      console.log('[Auth] Logout with invalid/expired token');
    }
  }
  
  // Clear all auth cookies
  clearAuthCookies(res);
  
  res.json({ success: true });
});

/**
 * GET /api/auth/status
 * Check authentication status (requires JWT)
 * 
 * Response: { authenticated: boolean, user?: object }
 */
router.get('/status', (req, res) => {
  // This endpoint requires JWT authentication
  // req.user is set by JWT middleware in server.js
  if (!req.user) {
    return res.status(401).json({
      authenticated: false,
      error: 'Not authenticated'
    });
  }
  
  res.json({
    authenticated: true,
    user: req.user
  });
});

module.exports = router;
