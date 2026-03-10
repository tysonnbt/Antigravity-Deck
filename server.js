// === AntigravityAuto Server — Entry Point ===
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const { PORT } = require('./src/config');
const { init, startAutoRescan } = require('./src/detector');
const { setupRoutes } = require('./src/routes');
const { setupWebSocket, startPolling } = require('./src/cache');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const fs = require('fs');
const path = require('path');
const { verifyAccessToken } = require('./src/jwt-utils');
const authRoutes = require('./src/auth-routes');
const csrfProtection = require('./src/csrf-middleware');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Security Headers - Helmet.js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Trust Cloudflare proxy - Trust only the first proxy (Cloudflare Tunnel)
// Setting to 1 prevents X-Forwarded-For spoofing attacks
app.set('trust proxy', 1);

// Network Hardening: Verify Cloudflare headers (optional debug logging)
if (process.env.VERIFY_CF_HEADERS === 'true') {
  app.use((req, res, next) => {
    console.log('[SECURITY CHECK] Headers:', {
      'cf-connecting-ip': req.headers['cf-connecting-ip'],
      'cf-ray': req.headers['cf-ray'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'direct-ip': req.socket.remoteAddress,
      'express-ip': req.ip,
    });
    next();
  });
}

// Create logs directory with restricted permissions
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { mode: 0o750 }); // rwxr-x--- (owner + group only)
}

// Redaction function for sensitive data
function redactSensitive(str) {
  if (!str) return str;
  // Redact auth keys (16+ hex chars)
  str = str.replace(/\b[a-f0-9]{16,}\b/gi, '[REDACTED-KEY]');
  // Redact JWT tokens
  str = str.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED-JWT]');
  // Redact email addresses
  str = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED-EMAIL]');
  return str;
}

// Rotating log stream with retention policy
const securityLogStream = rfs.createStream('security.log', {
  interval: '1d',        // Rotate daily
  maxFiles: 30,          // Keep 30 days of logs
  maxSize: '100M',       // Rotate if file exceeds 100MB
  compress: 'gzip',      // Compress rotated logs
  path: logDir,
});

// Custom morgan format with redaction
morgan.token('redacted-url', (req) => redactSensitive(req.originalUrl));
morgan.token('redacted-referrer', (req) => redactSensitive(req.get('referrer')));

// HTTP request logging with redaction
app.use(morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :redacted-url HTTP/:http-version" :status :res[content-length] ":redacted-referrer" ":user-agent"',
  { stream: securityLogStream }
));

// Security event tracking
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      url: redactSensitive(req.originalUrl),
      status: res.statusCode,
      duration,
      userAgent: req.get('user-agent'),
      cfRay: req.headers['cf-ray'],
    };
    
    // Alert on security events (console only, not to file to avoid duplication)
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.warn('🔒 Auth failure:', JSON.stringify(logData));
    }
    if (res.statusCode === 429) {
      console.warn('⚠️  Rate limit hit:', JSON.stringify(logData));
    }
    if (res.statusCode >= 500) {
      console.error('❌ Server error:', JSON.stringify(logData));
    }
  });
  
  next();
});

// Rate Limiting
// Note: express-rate-limit automatically handles IPv6 normalization when trust proxy is enabled
// We rely on req.ip which is already set correctly by Express with trust proxy
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  // Use default keyGenerator (req.ip) - properly handles IPv6
  // Cloudflare's cf-connecting-ip is already reflected in req.ip via X-Forwarded-For
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skipSuccessfulRequests: true,
  // Use default keyGenerator (req.ip) - properly handles IPv6
});

// Apply general limiter to all API routes
app.use('/api/', generalLimiter);

// Middleware - Apply 10mb limit for image upload endpoints BEFORE default 1mb
app.use('/api/media/save', express.json({ limit: '10mb' }));
app.use('/api/cascade/send', express.json({ limit: '10mb' }));
app.use('/api/cascade/submit', express.json({ limit: '10mb' }));
// Default 1mb limit for all other endpoints
app.use(express.json({ limit: '1mb' }));
// Cookie parser for JWT tokens
app.use(cookieParser());
// CORS — explicit allowlist for security
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:9808',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  const origin = req.headers.origin;
  
  // Only set CORS headers if origin is in allowlist or no origin (same-origin requests)
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  // For disallowed origins: omit CORS headers (browser will block)
  // Do NOT set 'null' - that's an explicit allow for null-origin contexts
  
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key, Authorization, X-CSRF-Token, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24h
  res.header('Vary', 'Origin'); // Prevent proxy caching issues
  
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Public route — must be registered BEFORE auth middleware
app.get('/api/ws-url', (req, res) => {
  res.json({ wsPort: Number(process.env.PORT || 3500) });
});

// JWT Authentication Middleware
const JWT_SECRET = process.env.JWT_SECRET || '';
const AUTH_KEY = process.env.AUTH_KEY || '';

if (JWT_SECRET) {
  console.log(`  🔒 JWT Auth enabled`);
  
  // Apply strict rate limiter to auth endpoints BEFORE mounting routes
  app.use('/api/auth/login', strictLimiter);
  app.use('/api/auth/refresh', strictLimiter);
  
  // Apply JWT authentication to all API routes except public endpoints
  app.use('/api', (req, res, next) => {
    // Skip auth for public endpoints
    if (req.path === '/ws-url' || req.path === '/auth/login') {
      return next();
    }
    
    // Localhost bypass only if explicitly enabled (disabled by default for security)
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    const allowLocalBypass = process.env.ALLOW_LOCALHOST_BYPASS === 'true';
    if (isLocal && allowLocalBypass) {
      req.user = { id: 'localhost-bypass' };
      return next();
    }

    // Extract JWT from Authorization header or cookie
    let token = null;
    
    // Try Authorization header first (Bearer token)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Fallback to cookie
    if (!token && req.cookies.access_token) {
      token = req.cookies.access_token;
    }
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Unauthorized - no token provided',
        code: 'NO_TOKEN'
      });
    }
    
    // Verify JWT
    try {
      const decoded = verifyAccessToken(token);
      req.user = { id: decoded.sub };
      next();
    } catch (err) {
      return res.status(401).json({ 
        error: err.message,
        code: err.code || 'TOKEN_INVALID'
      });
    }
  });
  
  // Apply CSRF protection to all API routes (after auth, before routes)
  app.use('/api', csrfProtection);
  
  // Mount auth routes (login is public, others are protected by middleware above)
  app.use('/api/auth', authRoutes);
  
  // Apply strict rate limiter to settings endpoint (sensitive operations)
  app.use('/api/settings', strictLimiter);
} else if (AUTH_KEY) {
  console.log('  ⚠️  JWT_SECRET not set - falling back to legacy x-auth-key authentication');
  console.log('  ⚠️  Please set JWT_SECRET environment variable for secure authentication');
  
  // Legacy auth for backward compatibility during migration
  app.use('/api', (req, res, next) => {
    if (req.path === '/ws-url' || req.path.startsWith('/auth/')) {
      return next();
    }
    
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    const allowLocalBypass = process.env.ALLOW_LOCALHOST_BYPASS === 'true';
    if (isLocal && allowLocalBypass) return next();

    const key = req.headers['x-auth-key'] || req.query.auth_key;
    
    if (!key || key.length !== AUTH_KEY.length) {
      return res.status(401).json({ error: 'Unauthorized — invalid or missing auth key' });
    }
    
    try {
      const keyBuffer = Buffer.from(key);
      const authBuffer = Buffer.from(AUTH_KEY);
      
      if (!crypto.timingSafeEqual(keyBuffer, authBuffer)) {
        return res.status(401).json({ error: 'Unauthorized — invalid or missing auth key' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized — invalid or missing auth key' });
    }
    
    next();
  });
  
  app.use('/api/settings', strictLimiter);
} else {
  console.log('  ⚠️  No JWT_SECRET or AUTH_KEY set — API is open (safe for local dev only)');
}

// Routes & WebSocket
setupRoutes(app);
setupWebSocket(wss);

// Start
server.listen(PORT, async () => {
  console.log(`\n  💬 Chat Mirror v2 (API) running at http://localhost:${PORT}\n`);
  await init(() => startPolling());
  const { startResourceMonitor } = require('./src/resource-monitor');
  startResourceMonitor();
  startAutoRescan();

  // Auto-start Agent Bridge if configured in settings.json
  const { getSettings } = require('./src/config');
  const bridgeCfg = getSettings().agentBridge || {};
  if (bridgeCfg.autoStart && bridgeCfg.discordBotToken && bridgeCfg.discordChannelId) {
    console.log('  🤖 Auto-starting Agent Bridge...');
    const bridge = require('./src/agent-bridge');
    bridge.startBridge(bridgeCfg).then(status => {
      console.log(`  🤖 Bridge ACTIVE — cascade: ${status.cascadeIdShort}`);
    }).catch(e => {
      console.error('  ❌ Bridge auto-start failed:', e.message);
    });
  }
});

