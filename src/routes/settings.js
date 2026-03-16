// === Settings Routes ===
// /api/settings GET + POST

// Module scope — z and SettingsSchema declared here (not inside handler function)
const { z } = require('zod');

const SettingsSchema = z.object({
    autoAccept: z.boolean().optional(),
    defaultWorkspaceRoot: z.string().max(500).optional(),
    suggestedWorkspaceRoot: z.string().max(500).optional(),
    defaultModel: z.string().max(100).optional(),
    activeProfile: z.string().max(100).nullable().optional(),
    profilesDir: z.string().max(500).nullable().optional(),
    notifications: z.object({
        enabled: z.boolean().optional(),
        events: z.object({
            cascadeComplete: z.boolean().optional(),
            waitingForUser: z.boolean().optional(),
            error: z.boolean().optional(),
            autoAccepted: z.boolean().optional(),
        }).optional(),
    }).optional(),
}).strict();

module.exports = function setupSettingsRoutes(app) {
    app.get('/api/settings', (req, res) => {
        const { getSettings } = require('../config');
        res.json(getSettings());
    });

    app.post('/api/settings', (req, res) => {
        try {
            const validated = SettingsSchema.parse(req.body);
            const { saveSettings } = require('../config');
            const updated = saveSettings(validated);
            console.log(`[*] Settings updated:`, JSON.stringify(updated));
            res.json(updated);
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    error: 'Invalid settings',
                    details: error.issues  // Zod v4 uses 'issues', not 'errors'
                });
            }
            throw error;
        }
    });
};
