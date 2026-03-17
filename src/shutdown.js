// === Graceful Shutdown Manager ===
// Centralizes cleanup of all timers, intervals, connections, and resources.
// Ensures no orphaned intervals or connections remain after server stop.

const cleanupFns = [];
let isShuttingDown = false;

/**
 * Register a cleanup function to be called on shutdown.
 * @param {string} name - Label for logging
 * @param {Function} fn - Cleanup function (may be async)
 */
function onShutdown(name, fn) {
    cleanupFns.push({ name, fn });
}

/**
 * Execute all registered cleanup functions and exit.
 * @param {string} signal - The signal that triggered shutdown
 * @param {import('http').Server} [server] - HTTP server to close
 */
async function shutdown(signal, server) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Shutdown] ${signal} received — cleaning up...`);

    // Close HTTP server first (stop accepting new connections)
    if (server) {
        await new Promise((resolve) => {
            server.close(() => {
                console.log('[Shutdown] HTTP server closed');
                resolve();
            });
            // Force close after 5s
            setTimeout(resolve, 5000);
        });
    }

    // Run all registered cleanup functions
    for (const { name, fn } of cleanupFns) {
        try {
            await fn();
            console.log(`[Shutdown] ✓ ${name}`);
        } catch (e) {
            console.error(`[Shutdown] ✗ ${name}: ${e.message}`);
        }
    }

    console.log('[Shutdown] Done. Exiting.');
    process.exit(0);
}

module.exports = { onShutdown, shutdown };
