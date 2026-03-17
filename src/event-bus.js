// === Event Bus ===
// Decouples broadcast from polling to eliminate circular dependencies.
// Instead of poller.js → ws.js → poller.js, modules emit events here
// and ws.js subscribes to them independently.

const EventEmitter = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(20); // Allow many subscribers

module.exports = bus;
