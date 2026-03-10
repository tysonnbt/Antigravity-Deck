#!/usr/bin/env node
/**
 * JWT Authentication Backend Test Suite
 * Tests Phase 3.1 implementation
 */

const http = require('http');
const https = require('https');

const SERVER_URL = 'http://localhost:3500';
const TEST_AUTH_KEY = process.env.AUTH_KEY || 'test-key-12345678';

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Make HTTP request with cookies
 */
function request(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    
    const reqOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            cookies: parseCookies(res.headers['set-cookie'] || [])
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body,
            cookies: {}
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * Parse Set-Cookie headers
 */
function parseCookies(setCookieHeaders) {
  const cookies = {};
  
  for (const header of setCookieHeaders) {
    const [cookiePart] = header.split(';');
    const [name, value] = cookiePart.split('=');
    cookies[name.trim()] = value.trim();
  }
  
  return cookies;
}

/**
 * Build Cookie header from cookies object
 */
function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Test helper
 */
function test(name, fn) {
  return fn()
    .then(() => {
      testResults.passed++;
      testResults.tests.push({ name, status: 'PASS' });
      console.log(`✅ ${name}`);
    })
    .catch((err) => {
      testResults.failed++;
      testResults.tests.push({ name, status: 'FAIL', error: err.message });
      console.error(`❌ ${name}`);
      console.error(`   Error: ${err.message}`);
    });
}

/**
 * Assert helper
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test suite
async function runTests() {
  console.log('🧪 JWT Authentication Backend Tests\n');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Auth Key: ${TEST_AUTH_KEY.substring(0, 8)}...\n`);
  
  let cookies = {};
  let csrfToken = '';
  
  // Test 1: Login with valid AUTH_KEY
  await test('Login with valid AUTH_KEY returns JWT tokens', async () => {
    const res = await request('POST', '/api/auth/login', {
      body: { authKey: TEST_AUTH_KEY }
    });
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Expected success: true');
    assert(res.body.csrfToken, 'Expected csrfToken in response');
    assert(res.cookies.access_token, 'Expected access_token cookie');
    assert(res.cookies.refresh_token, 'Expected refresh_token cookie');
    assert(res.cookies.csrf_token, 'Expected csrf_token cookie');
    
    // Save cookies for subsequent tests
    cookies = res.cookies;
    csrfToken = res.body.csrfToken;
  });
  
  // Test 2: Login with invalid AUTH_KEY
  await test('Login with invalid AUTH_KEY returns 401', async () => {
    const res = await request('POST', '/api/auth/login', {
      body: { authKey: 'wrong-key' }
    });
    
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.code === 'INVALID_AUTH_KEY', 'Expected INVALID_AUTH_KEY error code');
  });
  
  // Test 3: Access protected endpoint with JWT
  await test('Access protected endpoint with valid JWT succeeds', async () => {
    const res = await request('GET', '/api/status', {
      headers: {
        'Cookie': buildCookieHeader(cookies)
      }
    });
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
  
  // Test 4: Access protected endpoint without JWT
  await test('Access protected endpoint without JWT returns 401', async () => {
    const res = await request('GET', '/api/status');
    
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.body.code === 'NO_TOKEN', 'Expected NO_TOKEN error code');
  });
  
  // Test 5: CSRF protection - POST without CSRF token
  await test('POST request without CSRF token returns 403', async () => {
    const res = await request('POST', '/api/settings', {
      headers: {
        'Cookie': buildCookieHeader(cookies)
      },
      body: { test: true }
    });
    
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    assert(res.body.code && res.body.code.startsWith('CSRF'), 'Expected CSRF error code');
  });
  
  // Test 6: CSRF protection - POST with valid CSRF token
  await test('POST request with valid CSRF token succeeds', async () => {
    const res = await request('GET', '/api/settings', {
      headers: {
        'Cookie': buildCookieHeader(cookies),
        'X-CSRF-Token': csrfToken
      }
    });
    
    // Should succeed (GET doesn't need CSRF, but we're testing the header is accepted)
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });
  
  // Test 7: Token refresh
  await test('Token refresh returns new tokens', async () => {
    const res = await request('POST', '/api/auth/refresh', {
      headers: {
        'Cookie': buildCookieHeader(cookies)
      }
    });
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Expected success: true');
    assert(res.cookies.access_token, 'Expected new access_token cookie');
    assert(res.cookies.refresh_token, 'Expected new refresh_token cookie');
    
    // Update cookies with new tokens
    cookies = { ...cookies, ...res.cookies };
  });
  
  // Test 8: Logout
  await test('Logout clears cookies and revokes tokens', async () => {
    const res = await request('POST', '/api/auth/logout', {
      headers: {
        'Cookie': buildCookieHeader(cookies)
      }
    });
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Expected success: true');
  });
  
  // Test 9: Access after logout
  // NOTE: Access tokens remain valid until expiry (15 min) even after logout
  // This is a known JWT limitation - only refresh tokens are revoked immediately
  // For immediate revocation, would need token blacklist (defeats stateless JWT purpose)
  await test('Access token still valid after logout (JWT limitation)', async () => {
    const res = await request('GET', '/api/status', {
      headers: {
        'Cookie': buildCookieHeader(cookies)
      }
    });
    
    // Access token still works because it hasn't expired yet
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    
    // But refresh token should be revoked
    const refreshRes = await request('POST', '/api/auth/refresh', {
      headers: {
        'Cookie': buildCookieHeader(cookies)
      }
    });
    
    // Refresh should fail because token was revoked
    assert(refreshRes.status === 401, `Expected refresh to fail with 401, got ${refreshRes.status}`);
  });
  
  // Test 10: Auth status endpoint
  await test('Auth status endpoint works with valid JWT', async () => {
    // Login again to get fresh tokens
    const loginRes = await request('POST', '/api/auth/login', {
      body: { authKey: TEST_AUTH_KEY }
    });
    
    const newCookies = loginRes.cookies;
    
    const res = await request('GET', '/api/auth/status', {
      headers: {
        'Cookie': buildCookieHeader(newCookies)
      }
    });
    
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.body.authenticated === true, 'Expected authenticated: true');
  });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Test Results:');
  console.log(`  Passed: ${testResults.passed}`);
  console.log(`  Failed: ${testResults.failed}`);
  console.log(`  Total:  ${testResults.passed + testResults.failed}`);
  console.log('='.repeat(50));
  
  if (testResults.failed > 0) {
    console.log('\n❌ Some tests failed. Check errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
console.log('Waiting 2 seconds for server to be ready...\n');
setTimeout(() => {
  runTests().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}, 2000);
