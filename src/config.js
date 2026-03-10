// === Shared State & Constants ===
const os = require('os');
const fs = require('fs');
const path = require('path');

const lsConfig = { port: null, csrfToken: null, detected: false, useTls: false };
const lsInstances = []; // All detected LS instances: { pid, csrfToken, workspaceId, port, useTls, active }
const platform = os.platform(); // 'darwin', 'win32', 'linux'

const PORT = parseInt(process.env.PORT, 10) || 3500;
const POLL_INTERVAL = 3000;
const FAST_POLL_INTERVAL = 1000;  // Active cascade (running / waiting for user)
const SLOW_POLL_INTERVAL = 5000;  // Idle
const BATCH_SIZE = 200;
const STEP_WINDOW_SIZE = 500;       // max steps to hold in memory per conversation
const STEP_LOAD_CHUNK = 200;        // how many older steps to load on scroll-up

// --- Persistent settings ---
const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');
const DEFAULT_SETTINGS = {
    defaultWorkspaceRoot: path.join(os.homedir(), 'AntigravityWorkspaces'),
    defaultModel: 'MODEL_PLACEHOLDER_M26', // Claude Opus 4.6 (Thinking)
};

let _settings = null;

function loadSettings() {
    if (_settings) return _settings;
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) };
        } else {
            // Auto-create from sample if available, otherwise use defaults
            const samplePath = path.join(__dirname, '..', 'settings.sample.json');
            if (fs.existsSync(samplePath)) {
                fs.copyFileSync(samplePath, SETTINGS_PATH);
            }
            _settings = { ...DEFAULT_SETTINGS };
            saveSettings(_settings);
        }
    } catch {
        _settings = { ...DEFAULT_SETTINGS };
    }
    return _settings;
}

function saveSettings(updates) {
    _settings = { ...loadSettings(), ...updates };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(_settings, null, 2), 'utf-8');
    return _settings;
}

function getSettings() { return loadSettings(); }

module.exports = {
    lsConfig, lsInstances, platform, PORT,
    POLL_INTERVAL, FAST_POLL_INTERVAL, SLOW_POLL_INTERVAL, BATCH_SIZE,
    STEP_WINDOW_SIZE, STEP_LOAD_CHUNK,
    getSettings, saveSettings,
};
