// === Input Validation Schemas (Zod) ===
// Centralizes request validation for all API endpoints.

const { z } = require('zod');

// --- Common patterns ---
const cascadeIdSchema = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid cascade ID format');

// --- Cascade routes ---
const sendMessageSchema = z.object({
    cascadeId: cascadeIdSchema,
    message: z.string().min(1).max(1_000_000, 'Message too long (max 1MB)'),
    modelId: z.string().max(200).optional(),
    images: z.array(z.object({
        mimeType: z.string().regex(/^image\/(png|jpeg|gif|webp|svg\+xml)$/),
        inlineData: z.string().max(20_000_000).optional(), // ~15MB base64
        uri: z.string().max(2048).optional(),
        thumbnail: z.string().optional(),
    })).max(20).optional(),
    imageBase64: z.string().max(20_000_000).optional(),
    workspace: z.string().max(500).optional(),
});

const submitMessageSchema = z.object({
    message: z.string().min(1).max(1_000_000, 'Message too long (max 1MB)'),
    modelId: z.string().max(200).optional(),
    images: z.array(z.object({
        mimeType: z.string().regex(/^image\/(png|jpeg|gif|webp|svg\+xml)$/),
        inlineData: z.string().max(20_000_000).optional(),
        uri: z.string().max(2048).optional(),
        thumbnail: z.string().optional(),
    })).max(20).optional(),
    imageBase64: z.string().max(20_000_000).optional(),
    workspace: z.string().max(500).optional(),
});

// --- WebSocket message validation ---
const wsMessageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('set_conversation'), conversationId: cascadeIdSchema }),
    z.object({ type: z.literal('subscribe_all') }),
    z.object({
        type: z.literal('app_log'),
        level: z.enum(['log', 'info', 'warn', 'error', 'debug']).optional(),
        message: z.string().max(10_000).optional(),
        args: z.array(z.unknown()).max(10).optional(),
        module: z.string().max(200).optional(),
        ts: z.number().optional(),
    }),
]);

// --- Middleware factory ---

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with structured error on validation failure.
 */
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            return res.status(400).json({ error: 'Validation failed', details: errors });
        }
        req.body = result.data; // use parsed (stripped of extra fields)
        next();
    };
}

/**
 * Validate a cascade ID from route params.
 */
function validateCascadeId(req, res, next) {
    const result = cascadeIdSchema.safeParse(req.params.id);
    if (!result.success) {
        return res.status(400).json({ error: 'Invalid cascade ID' });
    }
    next();
}

module.exports = {
    cascadeIdSchema,
    sendMessageSchema,
    submitMessageSchema,
    wsMessageSchema,
    validate,
    validateCascadeId,
};
