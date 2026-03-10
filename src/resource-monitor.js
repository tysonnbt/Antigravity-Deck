// === Per-Workspace Resource Monitor ===
// Samples CPU% and RAM for each language_server process (by PID).
// Also tracks system-level CPU/RAM for overview dashboard.
// Cross-platform: Windows (PowerShell) + macOS/Linux (ps).

const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const { lsInstances, platform } = require('./config');

const SAMPLE_INTERVAL = 5000; // 5 seconds
const HISTORY_SIZE = 60;      // 60 samples = 5 minutes of history
const NUM_CPUS = os.cpus().length;
const TOTAL_MEM_MB = Math.round(os.totalmem() / 1024 / 1024);

// --- State ---
let monitorTimer = null;
const resourceData = new Map(); // pid → { cpuPercent, memBytes, memMB }
const prevCpuTimes = new Map(); // pid → { totalMs, timestamp } (Windows CPU delta tracking)

// System-level stats
let systemStats = { cpuPercent: 0, memUsedMB: 0, memTotalMB: TOTAL_MEM_MB, memPercent: 0 };

// Self-monitoring stats (Antigravity Deck app)
let selfStats = {
    backend: { pid: process.pid, cpuPercent: 0, memMB: 0 },
    frontend: { pid: null, cpuPercent: 0, memMB: 0 },
    totalCpuPercent: 0,
    totalMemMB: 0,
};
let prevSelfCpu = process.cpuUsage();
let prevSelfTs = Date.now();
let frontendPid = null; // cached Next.js process PID

// History ring buffer: array of { timestamp, system, workspaces }
const history = [];

// Previous system CPU idle/total for delta calculation
let prevSystemCpu = null;

// --- System-level CPU (cross-platform) ---

function getSystemCpuPercent() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (const cpu of cpus) {
        for (const type in cpu.times) totalTick += cpu.times[type];
        totalIdle += cpu.times.idle;
    }
    if (prevSystemCpu) {
        const idleDelta = totalIdle - prevSystemCpu.idle;
        const totalDelta = totalTick - prevSystemCpu.total;
        const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 1000) / 10 : 0;
        prevSystemCpu = { idle: totalIdle, total: totalTick };
        return Math.max(0, Math.min(100, cpuPercent));
    }
    prevSystemCpu = { idle: totalIdle, total: totalTick };
    return 0; // first call, no delta
}

function getSystemMemory() {
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const usedMem = totalMem - freeMem;
    return {
        memUsedMB: Math.round(usedMem / 1024 / 1024),
        memTotalMB: Math.round(totalMem / 1024 / 1024),
        memPercent: Math.round((usedMem / totalMem) * 1000) / 10,
    };
}

// --- Cross-platform process stats ---

/**
 * Windows: batch query all PIDs using PowerShell Get-Process.
 */
async function getStatsWindows(pids) {
    if (!pids.length) return new Map();

    return new Promise((resolve) => {
        const pidList = pids.join(',');
        const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const cmd = `"${ps}" -NoProfile -Command "Get-Process -Id ${pidList} -ErrorAction SilentlyContinue | Select-Object Id, CPU, WorkingSet64 | ConvertTo-Json -Compress"`;

        exec(cmd, { timeout: 8000 }, (err, stdout) => {
            const result = new Map();
            if (err || !stdout.trim()) { resolve(result); return; }

            try {
                let procs = JSON.parse(stdout.trim());
                if (!Array.isArray(procs)) procs = [procs];
                const now = Date.now();

                for (const proc of procs) {
                    if (!proc || !proc.Id) continue;
                    const pid = String(proc.Id);
                    const totalCpuSeconds = proc.CPU || 0;
                    const memBytes = proc.WorkingSet64 || 0;

                    let cpuPercent = 0;
                    const prev = prevCpuTimes.get(pid);
                    if (prev) {
                        const elapsedMs = now - prev.timestamp;
                        if (elapsedMs > 0) {
                            const deltaCpuMs = (totalCpuSeconds * 1000) - prev.totalMs;
                            cpuPercent = Math.max(0, (deltaCpuMs / elapsedMs) * 100);
                            cpuPercent = Math.min(cpuPercent, NUM_CPUS * 100);
                        }
                    }
                    prevCpuTimes.set(pid, { totalMs: totalCpuSeconds * 1000, timestamp: now });

                    result.set(pid, {
                        cpuPercent: Math.round(cpuPercent * 10) / 10,
                        memBytes,
                        memMB: Math.round(memBytes / 1024 / 1024),
                    });
                }
            } catch { }
            resolve(result);
        });
    });
}

/**
 * macOS/Linux: query using ps command.
 */
async function getStatsUnix(pids) {
    if (!pids.length) return new Map();

    return new Promise((resolve) => {
        const pidList = pids.join(',');
        const cmd = `ps -p ${pidList} -o pid,%cpu,rss --no-headers 2>/dev/null`;

        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            const result = new Map();
            if (err || !stdout.trim()) { resolve(result); return; }

            stdout.split('\n').forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 3) return;
                const [pid, cpuStr, rssStr] = parts;
                const cpuPercent = parseFloat(cpuStr) || 0;
                const rssKB = parseInt(rssStr) || 0;
                const memBytes = rssKB * 1024;

                result.set(pid, {
                    cpuPercent: Math.round(cpuPercent * 10) / 10,
                    memBytes,
                    memMB: Math.round(memBytes / 1024 / 1024),
                });
            });
            resolve(result);
        });
    });
}

/**
 * Get child process PIDs for a parent PID.
 */
async function getChildPids(parentPid) {
    return new Promise((resolve) => {
        let cmd;
        if (platform === 'win32') {
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            cmd = `"${ps}" -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ParentProcessId=${parentPid}\\" | Select-Object ProcessId | ConvertTo-Json -Compress"`;
        } else {
            cmd = `pgrep -P ${parentPid} 2>/dev/null`;
        }

        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout.trim()) { resolve([]); return; }
            const childPids = [];
            if (platform === 'win32') {
                try {
                    let items = JSON.parse(stdout.trim());
                    if (!Array.isArray(items)) items = [items];
                    items.forEach(item => { if (item && item.ProcessId) childPids.push(String(item.ProcessId)); });
                } catch { }
            } else {
                stdout.trim().split('\n').forEach(line => { const pid = line.trim(); if (pid) childPids.push(pid); });
            }
            resolve(childPids);
        });
    });
}

/**
 * Main sampling tick.
 */
async function sampleAll() {
    // --- System stats (always, even with no workspaces) ---
    const cpuPercent = getSystemCpuPercent();
    const mem = getSystemMemory();
    systemStats = { cpuPercent, ...mem };

    // --- Self-monitoring: backend Node.js process ---
    const nowTs = Date.now();
    const currentCpu = process.cpuUsage();
    const elapsedUs = (nowTs - prevSelfTs) * 1000; // ms → µs
    const userDelta = currentCpu.user - prevSelfCpu.user;
    const sysDelta = currentCpu.system - prevSelfCpu.system;
    const beCpuPercent = elapsedUs > 0
        ? Math.round(((userDelta + sysDelta) / elapsedUs) * 1000) / 10
        : 0;
    prevSelfCpu = currentCpu;
    prevSelfTs = nowTs;
    const beMemMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

    // --- Self-monitoring: frontend Next.js process ---
    let feCpuPercent = 0, feMemMB = 0;
    try {
        // Find frontend process: look for node processes running 'next'
        if (!frontendPid) {
            frontendPid = await findFrontendPid();
        }
        if (frontendPid) {
            const fePids = [String(frontendPid)];
            // Also get FE child processes (Next.js workers)
            const feChildren = await getChildPids(String(frontendPid));
            fePids.push(...feChildren);
            // Get all FE-related PIDs' stats including grandchildren
            const allFePids = [...fePids];
            for (const cp of feChildren) {
                const grandchildren = await getChildPids(cp);
                allFePids.push(...grandchildren);
            }
            const feStats = platform === 'win32'
                ? await getStatsWindows(allFePids)
                : await getStatsUnix(allFePids);
            for (const [, s] of feStats) {
                feCpuPercent += s.cpuPercent;
                feMemMB += s.memMB;
            }
        }
    } catch { }

    selfStats = {
        backend: { pid: process.pid, cpuPercent: Math.max(0, beCpuPercent), memMB: beMemMB },
        frontend: { pid: frontendPid, cpuPercent: Math.round(feCpuPercent * 10) / 10, memMB: feMemMB },
        totalCpuPercent: Math.round((beCpuPercent + feCpuPercent) * 10) / 10,
        totalMemMB: beMemMB + feMemMB,
    };

    // --- Per-workspace stats ---
    const pids = lsInstances.map(inst => String(inst.pid));

    if (pids.length > 0) {
        const childMap = new Map();
        const allPids = new Set(pids);

        try {
            await Promise.all(pids.map(async (pid) => {
                const children = await getChildPids(pid);
                childMap.set(pid, children);
                children.forEach(c => allPids.add(c));
            }));
        } catch { }

        const allPidArray = [...allPids];
        const statsMap = platform === 'win32'
            ? await getStatsWindows(allPidArray)
            : await getStatsUnix(allPidArray);

        for (const parentPid of pids) {
            const parentStats = statsMap.get(parentPid) || { cpuPercent: 0, memBytes: 0, memMB: 0 };
            const children = childMap.get(parentPid) || [];
            let totalCpu = parentStats.cpuPercent;
            let totalMem = parentStats.memBytes;

            for (const childPid of children) {
                const childStats = statsMap.get(childPid);
                if (childStats) { totalCpu += childStats.cpuPercent; totalMem += childStats.memBytes; }
            }

            resourceData.set(parentPid, {
                cpuPercent: Math.round(totalCpu * 10) / 10,
                memBytes: totalMem,
                memMB: Math.round(totalMem / 1024 / 1024),
            });
        }

        // Clean up stale PIDs
        for (const pid of resourceData.keys()) {
            if (!pids.includes(pid)) { resourceData.delete(pid); prevCpuTimes.delete(pid); }
        }
    }

    // --- Push to history ring buffer ---
    const workspaces = {};
    for (const [pid, stats] of resourceData) {
        const inst = lsInstances.find(i => String(i.pid) === pid);
        workspaces[pid] = { ...stats, name: inst?.workspaceName || pid, headless: inst?.headless || false };
    }

    history.push({
        timestamp: Date.now(),
        system: { ...systemStats },
        workspaces,
    });
    if (history.length > HISTORY_SIZE) history.shift();

    // --- Broadcast ---
    try {
        const { broadcastAll } = require('./ws');
        broadcastAll({ type: 'workspace_resources', data: getResourceSnapshot() });
    } catch { }
}

/**
 * Full snapshot: system + per-workspace + history.
 */
function getResourceSnapshot() {
    const workspaces = {};
    for (const [pid, stats] of resourceData) {
        const inst = lsInstances.find(i => String(i.pid) === pid);
        workspaces[pid] = { ...stats, name: inst?.workspaceName || pid, headless: inst?.headless || false };
    }

    return {
        system: { ...systemStats, cpuCores: NUM_CPUS },
        selfStats: { ...selfStats },
        workspaces,
        history: history.map(h => ({
            t: h.timestamp,
            cpu: h.system.cpuPercent,
            mem: h.system.memPercent,
        })),
    };
}

/**
 * Start the resource monitoring loop.
 */
function startResourceMonitor() {
    if (monitorTimer) return;
    console.log(`[*] Resource monitor started (interval: ${SAMPLE_INTERVAL / 1000}s, CPUs: ${NUM_CPUS}, RAM: ${TOTAL_MEM_MB}MB)`);
    // Initial sample after a short delay
    setTimeout(() => {
        sampleAll();
        monitorTimer = setInterval(sampleAll, SAMPLE_INTERVAL);
    }, 2000);
}

module.exports = { startResourceMonitor, getResourceSnapshot };

/**
 * Find the frontend Next.js process PID.
 * Strategy: find node processes with 'next' in command line.
 */
async function findFrontendPid() {
    return new Promise((resolve) => {
        if (platform === 'win32') {
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            const cmd = `"${ps}" -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*next*dev*' } | Select-Object ProcessId | ConvertTo-Json -Compress"`;
            exec(cmd, { timeout: 8000 }, (err, stdout) => {
                if (err || !stdout.trim()) { resolve(null); return; }
                try {
                    let items = JSON.parse(stdout.trim());
                    if (!Array.isArray(items)) items = [items];
                    // Return the first match
                    if (items.length > 0 && items[0].ProcessId) {
                        resolve(items[0].ProcessId);
                        return;
                    }
                } catch { }
                resolve(null);
            });
        } else {
            // macOS/Linux: find node processes with 'next' in args
            exec('pgrep -f "next.*dev" 2>/dev/null', { timeout: 5000 }, (err, stdout) => {
                if (err || !stdout.trim()) { resolve(null); return; }
                const pid = parseInt(stdout.trim().split('\n')[0]);
                resolve(pid || null);
            });
        }
    });
}
