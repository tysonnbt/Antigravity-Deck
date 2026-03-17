// === Express HTTP Routes — Entry Point ===
// All routes are organized by domain under ./routes/
// NOTE: GET /api/ws-url is registered in server.js (before auth middleware) — NOT here

function setupRoutes(app) {
    require('./routes/system')(app);
    require('./routes/profiles')(app);
    require('./routes/settings')(app);
    require('./routes/push')(app);
    require('./routes/workspaces')(app);
    require('./routes/git')(app);
    require('./routes/conversations')(app);
    require('./routes/cascade')(app);
    require('./routes/files')(app);
    require('./routes/workflows')(app);
    require('./routes/agent-bridge')(app);
    require('./routes/agent-api')(app);
    require('./routes/orchestrator-api')(app);
}

module.exports = { setupRoutes };
