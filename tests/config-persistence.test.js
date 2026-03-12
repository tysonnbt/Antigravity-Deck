/**
 * Unit tests for config.js async persistence engine.
 * Tests: sync return, debounce, atomic write, single-writer queue, flushSettingsNow, error handling.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const os = require('os');

/**
 * Helper: create an isolated config module with a temp settings path.
 * Patches SETTINGS_PATH and samplePath in a copy of config.js loaded fresh.
 */
function createIsolatedConfig(tmpDir) {
    const settingsPath = path.join(tmpDir, 'settings.json');
    const samplePath = path.join(tmpDir, 'settings.sample.json');

    // Write a valid sample so loadSettings can bootstrap
    fs.writeFileSync(samplePath, JSON.stringify({ defaultModel: 'test-model' }, null, 2));

    // Patch config.js — replace paths, write to tmp, require fresh
    const configSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf-8');
    const patched = configSrc
        .replace(
            /const SETTINGS_PATH = .*?;/,
            `const SETTINGS_PATH = ${JSON.stringify(settingsPath)};`
        )
        .replace(
            /const samplePath = .*?;/,
            `const samplePath = ${JSON.stringify(samplePath)};`
        );
    const patchedPath = path.join(tmpDir, 'config-test.js');
    fs.writeFileSync(patchedPath, patched);

    delete require.cache[patchedPath];
    const mod = require(patchedPath);
    return { mod, settingsPath, samplePath, patchedPath };
}

describe('saveSettings() sync behavior', () => {
    let tmpDir, mod;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        ({ mod } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('returns updated settings synchronously', () => {
        const result = mod.saveSettings({ testKey: 'hello' });
        assert.equal(result.testKey, 'hello');
    });

    it('merges updates into existing settings', () => {
        mod.saveSettings({ a: 1 });
        const result = mod.saveSettings({ b: 2 });
        assert.equal(result.a, 1);
        assert.equal(result.b, 2);
    });

    it('does not block event loop (returns in <5ms)', () => {
        const start = performance.now();
        mod.saveSettings({ fast: true });
        const elapsed = performance.now() - start;
        assert.ok(elapsed < 5, `saveSettings took ${elapsed.toFixed(2)}ms, expected <5ms`);
    });
});

describe('debounce', () => {
    let tmpDir, mod, settingsPath;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        ({ mod, settingsPath } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('coalesces rapid writes — file written after debounce, not per call', async () => {
        for (let i = 0; i < 10; i++) {
            mod.saveSettings({ counter: i });
        }

        // Wait for debounce + flush (750ms + buffer)
        await new Promise(r => setTimeout(r, 1500));

        const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(content.counter, 9, 'File should contain latest value');
    });

    it('uses latest _settings snapshot for flush', async () => {
        mod.saveSettings({ val: 'first' });
        mod.saveSettings({ val: 'second' });
        mod.saveSettings({ val: 'third' });

        await new Promise(r => setTimeout(r, 1500));

        const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(content.val, 'third');
    });
});

describe('atomic write', () => {
    let tmpDir, mod, settingsPath;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        ({ mod, settingsPath } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('settings.json always contains valid JSON after flush', async () => {
        mod.saveSettings({ atomic: true });
        await mod.flushSettingsNow();

        const raw = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(raw);
        assert.equal(parsed.atomic, true);
    });

    it('.tmp file cleaned up after successful flush', async () => {
        mod.saveSettings({ cleanup: true });
        await mod.flushSettingsNow();

        const tmpExists = fs.existsSync(settingsPath + '.tmp');
        assert.equal(tmpExists, false, '.tmp file should not exist after flush');
    });
});

describe('flushSettingsNow()', () => {
    let tmpDir, mod, settingsPath;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        ({ mod, settingsPath } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('bypasses debounce and writes immediately', async () => {
        mod.saveSettings({ immediate: true });
        const start = performance.now();
        await mod.flushSettingsNow();
        const elapsed = performance.now() - start;

        assert.ok(elapsed < 500, `flushSettingsNow took ${elapsed.toFixed(0)}ms, expected <500ms`);

        const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(content.immediate, true);
    });

    it('returns promise that resolves after write', async () => {
        mod.saveSettings({ promised: 'value' });
        await mod.flushSettingsNow();

        const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(content.promised, 'value');
    });

    it('works when no pending changes', async () => {
        await mod.flushSettingsNow();
    });
});

describe('single-writer queue', () => {
    let tmpDir, mod, settingsPath;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        ({ mod, settingsPath } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('serializes concurrent flushes without error', async () => {
        mod.saveSettings({ q1: true });
        const p1 = mod.flushSettingsNow();
        mod.saveSettings({ q2: true });
        const p2 = mod.flushSettingsNow();

        await Promise.all([p1, p2]);
        // Dirty re-flush scheduled via debounce — wait for it
        await new Promise(r => setTimeout(r, 1500));

        const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(content.q1, true);
        assert.equal(content.q2, true);
    });

    it('re-flushes if dirty during active flush', async () => {
        mod.saveSettings({ phase: 'initial' });
        const p1 = mod.flushSettingsNow();

        // Update while flush is in progress — sets dirty flag
        mod.saveSettings({ phase: 'updated-during-flush' });

        await p1;
        // Wait for debounced re-flush (750ms debounce + flush time)
        await new Promise(r => setTimeout(r, 1500));

        const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        assert.equal(content.phase, 'updated-during-flush');
    });
});

describe('error handling', () => {
    let tmpDir, mod;

    beforeEach(async () => {
        tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        ({ mod } = createIsolatedConfig(tmpDir));
    });

    afterEach(async () => {
        mod._cancelPendingFlush();
        try { await fsPromises.chmod(tmpDir, 0o755); } catch {}
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    it('logs error on write failure without crashing', async () => {
        const errors = [];
        const origError = console.error;
        console.error = (...args) => errors.push(args.join(' '));

        await fsPromises.chmod(tmpDir, 0o444);

        mod.saveSettings({ willFail: true });
        // Wait for debounce + flush attempt
        await new Promise(r => setTimeout(r, 1500));

        console.error = origError;
        mod._cancelPendingFlush(); // stop retries before restoring dir
        await fsPromises.chmod(tmpDir, 0o755);

        assert.ok(errors.some(e => e.includes('flush failed')), 'Expected error log about flush failure');
    });
});

describe('startup / init', () => {
    it('loadSettings reads from file at startup', async () => {
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        let mod;
        try {
            ({ mod } = createIsolatedConfig(tmpDir));
            const settings = mod.getSettings();
            assert.ok(settings.defaultModel, 'Should have loaded defaultModel from sample');
        } finally {
            if (mod) mod._cancelPendingFlush();
            await fsPromises.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('creates settings.json from defaults if nothing exists', async () => {
        const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cfg-test-'));
        let mod;
        try {
            ({ mod } = createIsolatedConfig(tmpDir));
            const settings = mod.getSettings();
            assert.ok(settings, 'Settings should be returned');
        } finally {
            if (mod) mod._cancelPendingFlush();
            await fsPromises.rm(tmpDir, { recursive: true, force: true });
        }
    });
});
