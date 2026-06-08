// === Redaction — scrub secrets/PII before persisting any captured sample ===
// server.js#redactSensitive misses UUID CSRF tokens; this is stricter and runs
// before ANY autoscan sample is written to disk.

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONGHEX = /\b[a-f0-9]{32,}\b/gi;

// Object keys whose VALUE is always sensitive regardless of content.
const SENSITIVE_KEY = /csrf|token|authorization|api[_-]?key|secret|password|^email$|apiKey|accessKey/i;

function redactString(s) {
    if (typeof s !== 'string') return s;
    return s
        .replace(JWT, '[REDACTED-JWT]')
        .replace(BEARER, 'Bearer [REDACTED]')
        .replace(UUID, '[REDACTED-UUID]')
        .replace(EMAIL, '[REDACTED-EMAIL]')
        .replace(LONGHEX, '[REDACTED-HEX]');
}

function redact(value, depth = 0) {
    if (value == null || depth > 8) return value;
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
        }
        return out;
    }
    return value;
}

// Redact a string and cap its length (for response-body samples).
function redactSample(value, maxLen = 4000) {
    const r = redact(value);
    const json = typeof r === 'string' ? r : JSON.stringify(r);
    if (json && json.length > maxLen) return json.slice(0, maxLen) + `…[+${json.length - maxLen} chars]`;
    return r;
}

module.exports = { redact, redactString, redactSample, SENSITIVE_KEY };
