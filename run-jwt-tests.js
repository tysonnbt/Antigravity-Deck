#!/usr/bin/env node
/**
 * JWT Backend Test Runner
 * Starts server with JWT auth and runs tests
 */

const { spawn } = require('child_process');
const http = require('http');

const JWT_SECRET = 'FFBqYGHJkER6W/tIKG1vEa0/E7VNh2RbvEwYrxbvon4=';
const AUTH_KEY = 'test-key-12345678';
const SERVER_PORT = 3500;

console.log('🧪 JWT Backend Test Runner\n');

// Start server with environment variables
console.log('Starting server with JWT authentication...');
const serverProcess = spawn('node', ['server.js'], {
  env: {
    ...process.env,
    JWT_SECRET,
    AUTH_KEY,
    ALLOW_LOCALHOST_BYPASS: 'false',
    NODE_ENV: 'development',
    PORT: SERVER_PORT.toString()
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverReady = false;

serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  
  if (output.includes('Chat Mirror v2 (API) running')) {
    serverReady = true;
  }
});

serverProcess.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

// Wait for server to be ready, then run tests
setTimeout(() => {
  if (!serverReady) {
    console.error('\n❌ Server failed to start within timeout');
    serverProcess.kill();
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Running JWT Authentication Tests');
  console.log('='.repeat(60) + '\n');
  
  // Run tests
  const testProcess = spawn('node', ['test-jwt-backend.js'], {
    env: {
      ...process.env,
      AUTH_KEY
    },
    stdio: 'inherit'
  });
  
  testProcess.on('exit', (code) => {
    console.log('\n' + '='.repeat(60));
    console.log('Shutting down server...');
    serverProcess.kill('SIGTERM');
    
    setTimeout(() => {
      if (code === 0) {
        console.log('✅ All tests passed!\n');
      } else {
        console.log('❌ Some tests failed\n');
      }
      process.exit(code);
    }, 1000);
  });
  
}, 5000); // Wait 5 seconds for server startup

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down...');
  serverProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
  process.exit(0);
});
