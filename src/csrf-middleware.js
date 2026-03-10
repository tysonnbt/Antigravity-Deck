// === CSRF Protection Middleware ===

/**
 * CSRF protection using double-submit cookie pattern
 * 
 * How it works:
 * 1. Server sets csrf_token cookie (not httpOnly, so client can read)
 * 2. Client reads cookie and sends value in X-CSRF-Token header
 * 3. Server verifies cookie matches header
 * 
 * This prevents CSRF because:
 * - Attacker can't read cookies from victim's browser (same-origin policy)
 * - Attacker can't set the X-CSRF-Token header in a CSRF attack
 */

/**
 * CSRF middleware - verifies CSRF token for state-changing requests
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function csrfProtection(req, res, next) {
  // Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for stateless API clients (mobile apps, service-to-service)
  // These clients should set X-API-Client: true header
  if (req.headers['x-api-client'] === 'true') {
    return next();
  }
  
  // Skip for auth endpoints (login doesn't have CSRF token yet)
  // Note: /auth/refresh DOES require CSRF token for consistency, even though
  // refresh tokens are single-use and inherently CSRF-safe. This is a design
  // choice to maintain uniform CSRF protection across all POST endpoints.
  if (req.path === '/auth/login' || req.path.startsWith('/auth/login')) {
    return next();
  }
  
  const csrfCookie = req.cookies.csrf_token;
  const csrfHeader = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!csrfCookie) {
    return res.status(403).json({ 
      error: 'CSRF token missing - please login again',
      code: 'CSRF_MISSING'
    });
  }
  
  if (!csrfHeader) {
    return res.status(403).json({ 
      error: 'CSRF token required in X-CSRF-Token header',
      code: 'CSRF_HEADER_MISSING'
    });
  }
  
  if (csrfCookie !== csrfHeader) {
    console.warn('[CSRF] Token mismatch:', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({ 
      error: 'CSRF token mismatch',
      code: 'CSRF_INVALID'
    });
  }
  
  // CSRF token valid
  next();
}

module.exports = csrfProtection;
