// === Agent Bridge Routes ===
// /api/agent-bridge/*

// Module scope — bridge and BridgeSettingsSchema declared here (not inside setupRoutes closure)
const { z } = require('zod');
const bridge = require('../agent-bridge');

const BridgeSettingsSchema = z.object({
    discordBotToken: z.string().max(200).optional(),
    discordChannelId: z.string().max(100).optional(),
    discordGuildId: z.string().max(100).optional(),
    stepSoftLimit: z.number().int().min(0).max(10000).optional(),
    allowedBotIds: z.array(z.string()).optional(),
    autoStart: z.boolean().optional(),
}).strict();

module.exports = function setupAgentBridgeRoutes(app) {
    app.post('/api/agent-bridge/start', async (req, res) => {
        try {
            const status = await bridge.startBridge(req.body || {});
            res.json({ ok: true, ...status });
        } catch (e) {
            res.status(400).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/agent-bridge/stop', (req, res) => {
        bridge.stopBridge();
        res.json({ ok: true });
    });

    app.get('/api/agent-bridge/status', (req, res) => {
        res.json(bridge.getStatus());
    });

    // Bridge-specific settings (bridge.settings.json)
    app.get('/api/agent-bridge/settings', (req, res) => {
        const { getBridgeSettings } = require('../config');
        res.json(getBridgeSettings());
    });

    app.post('/api/agent-bridge/settings', (req, res) => {
        try {
            const validated = BridgeSettingsSchema.parse(req.body);
            const { saveBridgeSettings } = require('../config');
            const updated = saveBridgeSettings(validated);
            res.json(updated);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: 'Invalid settings', details: error.issues });
            }
            throw error;
        }
    });
};
