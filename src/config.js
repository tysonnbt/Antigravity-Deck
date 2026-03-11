// === Shared State & Constants ===
const os = require('os');
const fs = require('fs');
const fsPromises = require('fs/promises');
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

// --- Async persistence engine ---
const DEBOUNCE_MS = 750;
const MAX_FLUSH_RETRIES = 3;

/**
 * Factory: create an async persist engine for a JSON settings file.
 * Pattern: sync in-memory update + debounced atomic flush to disk.
 * Atomic write: .tmp → fsync → rename → fsync parent dir.
 * Single-writer queue with dirty flag prevents race conditions.
 */
function _createPersistEngine(filePath) {
    let _timer = null;
    let _pending = null;
    let _dirty = false;
    let _retries = 0;
    let _lastError = null;
    let _data = null;

    async function _atomicFlush() {
        const tmpPath = filePath + '.tmp';
        const data = JSON.stringify(_data, null, 2);
        const dirPath = path.dirname(filePath);

        await fsPromises.writeFile(tmpPath, data, 'utf-8');

        // fsync temp file to ensure data on disk
        const fd = await fsPromises.open(tmpPath, 'r');
        await fd.sync();
        await fd.close();

        // atomic rename
        await fsPromises.rename(tmpPath, filePath);

        // fsync parent dir to persist rename metadata
        try {
            const dirFd = await fsPromises.open(dirPath, 'r');
            await dirFd.sync();
            await dirFd.close();
        } catch {
            // dir fsync may fail on some OS/FS — rename already happened
        }
    }

    function _scheduledFlush() {
        if (_pending) {
            _dirty = true;
            return _pending;
        }
        _dirty = false;
        _pending = _atomicFlush()
            .then(() => {
                _lastError = null;
                _retries = 0;
            })
            .catch(err => {
                _lastError = err;
                _retries++;
                if (_retries < MAX_FLUSH_RETRIES) {
                    _dirty = true; // retry on next schedule
                }
                console.error(`[config] Settings flush failed (${filePath}):`, err.message);
            })
            .finally(() => {
                _pending = null;
                if (_dirty) {
                    _dirty = false;
                    _scheduledFlush();
                }
            });
        return _pending;
    }

    function _schedulePersist() {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(() => {
            _timer = null;
            _scheduledFlush();
        }, DEBOUNCE_MS);
    }

    function save(updates) {
        _data = { ..._data, ...updates };
        _schedulePersist();
        return _data;
    }

    function flushNow() {
        if (_timer) {
            clearTimeout(_timer);
            _timer = null;
        }
        return _scheduledFlush();
    }

    function cancelPending() {
        if (_timer) {
            clearTimeout(_timer);
            _timer = null;
        }
        _dirty = false;
    }

    return {
        save,
        flushNow,
        cancelPending,
        getData: () => _data,
        setData: (d) => { _data = d; },
    };
}

// --- Persistent settings ---
const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');
const DEFAULT_SETTINGS = {
    defaultWorkspaceRoot: path.join(os.homedir(), 'AntigravityWorkspaces'),
    defaultModel: 'MODEL_PLACEHOLDER_M26', // Claude Opus 4.6 (Thinking)
};

const _settingsEngine = _createPersistEngine(SETTINGS_PATH);
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
            // Initial creation — sync write is acceptable (one-time, before event loop)
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(_settings, null, 2), 'utf-8');
        }
    } catch {
        _settings = { ...DEFAULT_SETTINGS };
    }
    // Seed engine with loaded data
    _settingsEngine.setData(_settings);
    return _settings;
}

function saveSettings(updates) {
    _settings = _settingsEngine.save({ ...loadSettings(), ...updates });
    return _settings;
}

function getSettings() { return loadSettings(); }

// --- Bridge-specific settings (bridge.settings.json) ---
const BRIDGE_SETTINGS_PATH = path.join(__dirname, '..', 'bridge.settings.json');
const DEFAULT_BRIDGE_SETTINGS = {
    discordBotToken: '',
    discordChannelId: '',
    discordGuildId: '',
    stepSoftLimit: 500,
    allowedBotIds: [],
    autoStart: false,
    currentWorkspace: '',
    lastCascadeId: '',
    lastStepCount: 0,
    lastRelayedStepIndex: -1,
};

const _bridgeEngine = _createPersistEngine(BRIDGE_SETTINGS_PATH);
let _bridgeSettings = null;

function loadBridgeSettings() {
    if (_bridgeSettings) return _bridgeSettings;
    try {
        if (fs.existsSync(BRIDGE_SETTINGS_PATH)) {
            _bridgeSettings = { ...DEFAULT_BRIDGE_SETTINGS, ...JSON.parse(fs.readFileSync(BRIDGE_SETTINGS_PATH, 'utf-8')) };
        } else {
            _bridgeSettings = { ...DEFAULT_BRIDGE_SETTINGS };
        }
    } catch {
        _bridgeSettings = { ...DEFAULT_BRIDGE_SETTINGS };
    }
    _bridgeEngine.setData(_bridgeSettings);
    return _bridgeSettings;
}

function saveBridgeSettings(updates) {
    _bridgeSettings = _bridgeEngine.save({ ...loadBridgeSettings(), ...updates });
    return _bridgeSettings;
}

function getBridgeSettings() { return loadBridgeSettings(); }

module.exports = {
    lsConfig, lsInstances, platform, PORT,
    POLL_INTERVAL, FAST_POLL_INTERVAL, SLOW_POLL_INTERVAL, BATCH_SIZE,
    STEP_WINDOW_SIZE, STEP_LOAD_CHUNK,
    getSettings, saveSettings,
    getBridgeSettings, saveBridgeSettings,
    flushSettingsNow: () => _settingsEngine.flushNow(),
    flushBridgeSettingsNow: () => _bridgeEngine.flushNow(),
    _cancelPendingFlush: () => { _settingsEngine.cancelPending(); _bridgeEngine.cancelPending(); },
};
