// === AntigravityAuto Server — Entry Point ===
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { PORT } = require('./src/config');
const { init, startAutoRescan } = require('./src/detector');
const { setupRoutes } = require('./src/routes');
const { setupWebSocket, startPolling } = require('./src/cache');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

// Public route — must be registered BEFORE auth middleware
app.get('/api/ws-url', (req, res) => {
  res.json({ wsPort: Number(process.env.PORT || 3500) });
});

// Auth middleware — only active when AUTH_KEY env var is set
const AUTH_KEY = process.env.AUTH_KEY || '';
if (AUTH_KEY) {
  console.log(`  🔒 Auth enabled (key length: ${AUTH_KEY.length})`);
  app.use('/api', (req, res, next) => {
    // Always allow requests from localhost — no key needed for local access
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (isLocal) return next();

    const key = req.headers['x-auth-key'] || req.query.auth_key;
    if (key !== AUTH_KEY) {
      return res.status(401).json({ error: 'Unauthorized — invalid or missing auth key' });
    }
    next();
  });
} else {
  console.log('  ⚠️  No AUTH_KEY set — API is open (safe for local dev)');
}

// Routes & WebSocket
setupRoutes(app);
setupWebSocket(wss);

// Start
server.listen(PORT, async () => {
  console.log(`\n  💬 Chat Mirror v2 (API) running at http://localhost:${PORT}\n`);
  await init(() => startPolling());
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

