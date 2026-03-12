/**
 * Integration tests for settings persistence.
 * Tests: POST /api/settings end-to-end, bridge-style rapid saves, event loop lag.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const os = require('os');
const http = require('http');

/**
 * Helper: create isolated config module with temp paths (same as unit tests).
 */
function createIsolatedConfig(tmpDir) {
    const settingsPath = path.join(tmpDir, 'settings.json');
    const samplePath = path.join(tmpDir, 'settings.sample.json');

    fs.writeFileSync(samplePath, JSON.stringify({ defaultModel: 'test-model' }, null, 2));

    const configSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf-8');
    const patched = configSrc
        .replace(/const SETTINGS_PATH = .*?;/, `const SETTINGS_PATH = ${JSON.stringify(settingsPath)};`)
        .replace(/const samplePath = .*?;/, `const samplePath = ${JSON.stringify(samplePath)};`);
    const patchedPath = path.join(tmpDir, 'config-test.js');
    fs.writeFileSync(patchedPath, patched);

    delete require.cache[patchedPath];
    const mod = require(patchedPath);
    return { mod, settingsPath, patchedPath };
}

/**
 * Helper: create a minimal Express app with just POST /api/settings.
 * Avoids importing full routes.js (too many deps).
 */
function createTestApp(configMod) {
    const express = require('express');
    const app = express();
    app.use(express.json());

    app.post('/api/settings', async (req, res) => {
        try {
            const updated = configMod.saveSettings(req.body);
            await configMod.flushSettingsNow();
            res.json(updated);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/settings', (req, res) => {
        res.json(configMod.getSettings());
    });

    return app;
}

/**
 * Helper: send HTTP request and get response.
 */
function httpRequest(server, method, path, body) {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const options = {
            hostname: '127.0.0.1',
            port: addr.port,
            path,
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: data ? JSON.parse(data) : null,
                });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

describe('POST /api/settings (integration)', () => {
    let tmpDir, mod, settingsPath, server;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-int-'));
        ({ mod, settingsPath } = createIsolatedConfig(tmpDir));
        const app = createTestApp(mod);
        server = app.listen(0); // random port
        await new Promise(r => server.once('listening', r));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await new Promise(r => server.close(r));
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns 200 with updated settings', async () => {
        const res = await httpRequest(server, 'POST', '/api/settings', { defaultModel: 'new-model' });
        assert.equal(res.status, 200);
        assert.equal(res.body.defaultModel, 'new-model');
    });

    it('persists to disk before response', async () => {
        await httpRequest(server, 'POST', '/api/settings', { defaultModel: 'persisted' });

        // Immediately read from disk — should already be there
        const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(onDisk.defaultModel, 'persisted');
    });

    it('handles concurrent POST requests', async () => {
        const results = await Promise.all([
            httpRequest(server, 'POST', '/api/settings', { defaultModel: 'a' }),
            httpRequest(server, 'POST', '/api/settings', { defaultModel: 'b' }),
            httpRequest(server, 'POST', '/api/settings', { defaultModel: 'c' }),
        ]);

        // All should return 200
        for (const r of results) {
            assert.equal(r.status, 200);
        }

        // File on disk should be valid JSON with one of the values
        const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.ok(['a', 'b', 'c'].includes(onDisk.defaultModel), `Expected one of a/b/c, got ${onDisk.defaultModel}`);
    });
});

describe('bridge-style rapid saves (integration)', () => {
    let tmpDir, mod, settingsPath;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-int-'));
        ({ mod, settingsPath } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('coalesces rapid bridge state saves', async () => {
        // Simulate bridge burst: 20 rapid saveSettings calls
        for (let i = 0; i < 20; i++) {
            mod.saveSettings({ agentBridge: { lastCascadeId: `cascade-${i}` } });
        }

        // Wait for debounce + flush
        await new Promise(r => setTimeout(r, 1500));

        const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(onDisk.agentBridge.lastCascadeId, 'cascade-19', 'Should have last cascade ID');
    });

    it('does not block event loop during saves', async () => {
        // Measure event loop lag while doing rapid saves
        const lags = [];
        let lastTick = Date.now();
        let measuring = true;

        function tick() {
            const now = Date.now();
            lags.push(now - lastTick - 1); // subtract expected 1ms delay
            lastTick = now;
            if (measuring) setTimeout(tick, 1);
        }
        setTimeout(tick, 1);

        // Fire 50 rapid saves
        for (let i = 0; i < 50; i++) {
            mod.saveSettings({ bridgeCounter: i });
        }

        // Let event loop settle
        await new Promise(r => setTimeout(r, 200));
        measuring = false;
        await new Promise(r => setTimeout(r, 50));

        const maxLag = Math.max(...lags);
        // With writeFileSync, each save blocks ~1-5ms → 50 saves = 50-250ms of blocking
        // With async flush, max lag should be <10ms (just JS overhead)
        assert.ok(maxLag < 50, `Max event loop lag was ${maxLag}ms, expected <50ms`);
    });

    it('survives simulated restart (write → read back)', async () => {
        mod.saveSettings({ agentBridge: { lastCascadeId: 'survive-test' } });
        await mod.flushSettingsNow();

        // Simulate restart: clear require cache, reload
        const patchedPath = path.join(tmpDir, 'config-test.js');
        delete require.cache[patchedPath];
        const freshMod = require(patchedPath);

        const settings = freshMod.getSettings();
        assert.equal(settings.agentBridge.lastCascadeId, 'survive-test');

        freshMod._cancelPendingFlush();
    });
});
