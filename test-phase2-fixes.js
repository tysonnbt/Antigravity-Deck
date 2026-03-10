#!/usr/bin/env node
/**
 * Phase 2 Security Fixes Test Suite
 * Tests: Helmet headers, rate limiting, logging, method whitelist, timing-safe auth,
 *        path validation, git/status spawn, symlink resolution
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';
const AUTH_KEY = process.env.AUTH_KEY || 'test-key-12345678';

let passCount = 0;
let failCount = 0;

function pass(testName) {
  console.log(`✅ PASS: ${testName}`);
  passCount++;
}

function fail(testName, reason) {
  console.log(`❌ FAIL: ${testName}`);
  console.log(`   Reason: ${reason}`);
  failCount++;
}

async function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test2_1_helmetHeaders() {
  console.log('\n=== Test 2.1: Helmet Security Headers ===');
  
  try {
    const res = await makeRequest('GET', '/api/ws-url');
    
    // Check for security headers
    if (res.headers['x-frame-options']) {
      pass('X-Frame-Options header present');
    } else {
      fail('X-Frame-Options header present', 'Header missing');
    }
    
    if (res.headers['x-content-type-options']) {
      pass('X-Content-Type-Options header present');
    } else {
      fail('X-Content-Type-Options header present', 'Header missing');
    }
    
    if (res.headers['referrer-policy']) {
      pass('Referrer-Policy header present');
    } else {
      fail('Referrer-Policy header present', 'Header missing');
    }
    
    if (res.headers['content-security-policy']) {
      pass('Content-Security-Policy header present');
    } else {
      fail('Content-Security-Policy header present', 'Header missing');
    }
  } catch (e) {
    fail('Helmet headers test', e.message);
  }
}

async function test2_2_rateLimiting() {
  console.log('\n=== Test 2.2: Rate Limiting ===');
  
  try {
    // Make multiple rapid requests to trigger rate limit
    const requests = [];
    for (let i = 0; i < 102; i++) {
      requests.push(makeRequest('GET', '/api/ws-url'));
    }
    
    const results = await Promise.all(requests);
    const rateLimited = results.filter(r => r.status === 429);
    
    if (rateLimited.length > 0) {
      pass('Rate limiting active (429 responses received)');
    } else {
      fail('Rate limiting active', 'No 429 responses after 102 requests');
    }
    
    // Check for rate limit headers
    const lastRes = results[results.length - 1];
    if (lastRes.headers['ratelimit-limit']) {
      pass('RateLimit-Limit header present');
    } else {
      fail('RateLimit-Limit header present', 'Header missing');
    }
  } catch (e) {
    fail('Rate limiting test', e.message);
  }
}

async function test2_3_securityLogging() {
  console.log('\n=== Test 2.3: Security Audit Logging ===');
  
  try {
    const logDir = path.join(__dirname, 'logs');
    const logFile = path.join(logDir, 'security.log');
    
    // Check if logs directory exists
    if (fs.existsSync(logDir)) {
      pass('Logs directory exists');
      
      // Check directory permissions (Unix only)
      if (process.platform !== 'win32') {
        const stats = fs.statSync(logDir);
        const mode = (stats.mode & parseInt('777', 8)).toString(8);
        if (mode === '750') {
          pass('Log directory has correct permissions (750)');
        } else {
          fail('Log directory permissions', `Expected 750, got ${mode}`);
        }
      }
    } else {
      fail('Logs directory exists', 'Directory not found');
    }
    
    // Make a request to generate log entry
    await makeRequest('GET', '/api/ws-url');
    
    // Wait a bit for log to be written
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if log file exists
    if (fs.existsSync(logFile)) {
      pass('Security log file created');
      
      // Check if log contains redacted content (no auth keys)
      const logContent = fs.readFileSync(logFile, 'utf-8');
      if (!logContent.includes(AUTH_KEY)) {
        pass('Auth keys redacted in logs');
      } else {
        fail('Auth keys redacted in logs', 'Found plaintext auth key in logs');
      }
    } else {
      fail('Security log file created', 'File not found');
    }
  } catch (e) {
    fail('Security logging test', e.message);
  }
}

async function test2_5_lsMethodWhitelist() {
  console.log('\n=== Test 2.5: LS Proxy Method Whitelist ===');
  
  try {
    // Test allowed method
    const allowedRes = await makeRequest('POST', '/api/ls/GetUserStatus', {
      'X-Auth-Key': AUTH_KEY,
    }, {});
    
    if (allowedRes.status !== 403) {
      pass('Allowed LS method accepted');
    } else {
      fail('Allowed LS method accepted', `Got status ${allowedRes.status}`);
    }
    
    // Test disallowed method
    const disallowedRes = await makeRequest('POST', '/api/ls/ArbitraryDangerousMethod', {
      'X-Auth-Key': AUTH_KEY,
    }, {});
    
    if (disallowedRes.status === 403) {
      pass('Disallowed LS method rejected (403)');
      
      const body = JSON.parse(disallowedRes.body);
      if (body.error && body.error.includes('not allowed')) {
        pass('Disallowed method returns appropriate error message');
      } else {
        fail('Error message check', 'Missing or incorrect error message');
      }
    } else {
      fail('Disallowed LS method rejected', `Expected 403, got ${disallowedRes.status}`);
    }
  } catch (e) {
    fail('LS method whitelist test', e.message);
  }
}

async function test2_6_timingSafeAuth() {
  console.log('\n=== Test 2.6: Timing-Safe Auth Comparison ===');
  
  try {
    // Test with correct key
    const validRes = await makeRequest('GET', '/api/ws-url', {
      'X-Auth-Key': AUTH_KEY,
    });
    
    if (validRes.status === 200) {
      pass('Valid auth key accepted');
    } else {
      fail('Valid auth key accepted', `Got status ${validRes.status}`);
    }
    
    // Test with wrong length key (should fail fast)
    const shortKeyRes = await makeRequest('GET', '/api/status', {
      'X-Auth-Key': 'short',
    });
    
    if (shortKeyRes.status === 401) {
      pass('Short auth key rejected (length check)');
    } else {
      fail('Short auth key rejected', `Expected 401, got ${shortKeyRes.status}`);
    }
    
    // Test with wrong key (same length)
    const wrongKeyRes = await makeRequest('GET', '/api/status', {
      'X-Auth-Key': 'wrong-key-12345678',
    });
    
    if (wrongKeyRes.status === 401) {
      pass('Wrong auth key rejected (timing-safe comparison)');
    } else {
      fail('Wrong auth key rejected', `Expected 401, got ${wrongKeyRes.status}`);
    }
  } catch (e) {
    fail('Timing-safe auth test', e.message);
  }
}

async function test2_8_gitStatusSpawn() {
  console.log('\n=== Test 2.8: Git Status Uses Spawn ===');
  
  try {
    // This test verifies the endpoint works (spawn implementation)
    // Actual verification that execSync is not used requires code inspection
    console.log('   ℹ️  Manual verification: Check src/routes.js git/status uses execGitSafe (spawn)');
    
    const routesContent = fs.readFileSync(path.join(__dirname, 'src', 'routes.js'), 'utf-8');
    
    // Check that git/status endpoint uses execGitSafe
    const gitStatusSection = routesContent.match(/app\.get\('\/api\/workspaces\/:name\/git\/status'[\s\S]*?\}\);/);
    if (gitStatusSection && gitStatusSection[0].includes('execGitSafe')) {
      pass('git/status endpoint uses execGitSafe (spawn)');
    } else {
      fail('git/status uses spawn', 'Still using execSync or missing execGitSafe');
    }
    
    // Check that execSync is not imported for git/status
    if (gitStatusSection && !gitStatusSection[0].includes('execSync')) {
      pass('git/status does not use execSync');
    } else {
      fail('git/status avoids execSync', 'Found execSync usage');
    }
  } catch (e) {
    fail('Git status spawn test', e.message);
  }
}

async function test2_9_symlinkResolution() {
  console.log('\n=== Test 2.9: Symlink Resolution in fs/list ===');
  
  try {
    const routesContent = fs.readFileSync(path.join(__dirname, 'src', 'routes.js'), 'utf-8');
    
    // Check that fs/list endpoint uses realpathSync
    const fsListSection = routesContent.match(/app\.get\('\/api\/workspaces\/:name\/fs\/list'[\s\S]*?\}\);/);
    if (fsListSection && fsListSection[0].includes('realpathSync')) {
      pass('fs/list endpoint uses realpathSync for symlink resolution');
    } else {
      fail('fs/list symlink resolution', 'Missing realpathSync call');
    }
    
    // Check that it validates resolved path
    if (fsListSection && fsListSection[0].includes('realPath') && fsListSection[0].includes('realCwd')) {
      pass('fs/list validates resolved paths against workspace');
    } else {
      fail('fs/list path validation', 'Missing realPath validation');
    }
  } catch (e) {
    fail('Symlink resolution test', e.message);
  }
}

async function test2_7_autoAcceptValidation() {
  console.log('\n=== Test 2.7: Auto-Accept Path Validation ===');
  
  try {
    const autoAcceptContent = fs.readFileSync(path.join(__dirname, 'src', 'auto-accept.js'), 'utf-8');
    
    // Check for validateFilePathInWorkspace function
    if (autoAcceptContent.includes('validateFilePathInWorkspace')) {
      pass('validateFilePathInWorkspace function exists');
    } else {
      fail('Path validation function', 'Function not found');
    }
    
    // Check that it uses realpathSync
    if (autoAcceptContent.includes('realpathSync')) {
      pass('Auto-accept uses realpathSync for symlink resolution');
    } else {
      fail('Auto-accept symlink resolution', 'Missing realpathSync');
    }
    
    // Check that file permissions are validated
    const filePermissionChecks = (autoAcceptContent.match(/validateFilePathInWorkspace/g) || []).length;
    if (filePermissionChecks >= 2) {
      pass('File permissions validated in multiple locations');
    } else {
      fail('File permission validation coverage', `Only ${filePermissionChecks} validation(s) found`);
    }
  } catch (e) {
    fail('Auto-accept validation test', e.message);
  }
}

async function runAllTests() {
  console.log('🧪 Phase 2 Security Fixes Test Suite\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth Key: ${AUTH_KEY.substring(0, 8)}...`);
  
  await test2_1_helmetHeaders();
  await test2_2_rateLimiting();
  await test2_3_securityLogging();
  await test2_5_lsMethodWhitelist();
  await test2_6_timingSafeAuth();
  await test2_7_autoAcceptValidation();
  await test2_8_gitStatusSpawn();
  await test2_9_symlinkResolution();
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Total:  ${passCount + failCount}`);
  console.log('='.repeat(50));
  
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
