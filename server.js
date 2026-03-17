// === AntigravityAuto Server — Entry Point ===
const logger = require('./src/logger'); // MUST be first — intercepts console.* globally
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { PORT } = require('./src/config');
const { init, startAutoRescan } = require('./src/detector');
const { setupRoutes } = require('./src/routes');
const { setupWebSocket, startPolling } = require('./src/cache');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Three WebSocket servers: UI (/ws), Agent API (/ws/agent), Orchestrator (/ws/orchestrator)
const wss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });
const orchestratorWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/ws/orchestrator') {
    orchestratorWss.handleUpgrade(req, socket, head, ws => orchestratorWss.emit('connection', ws, req));
  } else if (pathname === '/ws/agent') {
    agentWss.handleUpgrade(req, socket, head, ws => agentWss.emit('connection', ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  }
});

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

// Trust Cloudflare proxy - Express will parse X-Forwarded-For automatically
app.set('trust proxy', true);

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
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || ipKeyGenerator(req),
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || ipKeyGenerator(req),
  skipSuccessfulRequests: true,
});

// Apply general limiter to all API routes
app.use('/api/', generalLimiter);

// Middleware - Apply 10mb limit for image upload endpoints BEFORE default 1mb
app.use('/api/media/save', express.json({ limit: '10mb' }));
app.use('/api/cascade/send', express.json({ limit: '10mb' }));
app.use('/api/cascade/submit', express.json({ limit: '10mb' }));
// Default 1mb limit for all other endpoints
app.use(express.json({ limit: '1mb' }));
// CORS — allow frontend on any port/origin to call backend API
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Key, Authorization, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24h
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Disable browser caching for API routes — always return 200 with fresh data
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Public route — must be registered BEFORE auth middleware
app.get('/api/ws-url', (req, res) => {
  res.json({ wsPort: Number(process.env.PORT || 3500) });
});

// Auth middleware — only active when AUTH_KEY env var is set
const isNoAuth = process.argv.includes('--no-auth');
const AUTH_KEY = isNoAuth ? '' : (process.env.AUTH_KEY || '');
if (AUTH_KEY) {
  console.log(`  🔒 Auth enabled (key length: ${AUTH_KEY.length})`);
  app.use('/api', (req, res, next) => {
    // Skip auth for public endpoints
    if (req.path === '/ws-url' || req.path === '/status') {
      return next();
    }
    
    // Localhost bypass only if explicitly enabled (disabled by default for security)
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    const allowLocalBypass = process.env.ALLOW_LOCALHOST_BYPASS === 'true';
    if (isLocal && allowLocalBypass) return next();

    const key = req.headers['x-auth-key'] || req.query.auth_key;
    
    // Timing-safe comparison to prevent timing attacks
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
  
  // Apply strict rate limiter to sensitive operations
  app.use('/api/settings', strictLimiter);
  app.use('/api/launch-ide', strictLimiter);
  app.use('/api/kill-ide', strictLimiter);
} else {
  console.log('  ⚠️  No AUTH_KEY set — API is open (safe for local dev)');
}

// Routes & WebSocket
setupRoutes(app);
setupWebSocket(wss);

// Agent WebSocket — external AI agent protocol at /ws/agent
const { setupAgentWebSocket } = require('./src/ws-agent');
setupAgentWebSocket(agentWss);

// Orchestrator WebSocket — orchestrator protocol at /ws/orchestrator
const { setupOrchestratorWebSocket } = require('./src/ws-orchestrator');
setupOrchestratorWebSocket(orchestratorWss);

// Configure Agent Session Manager from settings
const { getAgentApiSettings } = require('./src/config');
const sessionManager = require('./src/agent-session-manager');
const agentApiCfg = getAgentApiSettings();
sessionManager.configure({
  maxConcurrentSessions: agentApiCfg.maxConcurrentSessions,
  sessionTimeoutMs: agentApiCfg.sessionTimeoutMs,
  defaultStepSoftLimit: agentApiCfg.defaultStepSoftLimit,
});

// Connect logger → broadcast app_log events to Live Logs viewers
logger.connect(require('./src/ws').broadcastToGlobal);

// Start
server.listen(PORT, async () => {
  console.log(`\n  💬 Antigravity Deck (API) running at http://localhost:${PORT}\n`);
  // Initialize Web Push VAPID keys
  try {
    const { initVapid } = require('./src/push-service');
    initVapid();
  } catch (e) {
    console.warn('  ⚠️  Push service init failed:', e.message);
  }
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

