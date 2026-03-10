#!/usr/bin/env node
// Test script for Phase 1 security fixes
// Verifies: localhost bypass, auth key removal, CORS hardening, file read security

const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3500';
const AUTH_KEY = process.env.AUTH_KEY || 'test-key-12345678';

let passed = 0;
let failed = 0;

function log(emoji, message) {
    console.log(`${emoji} ${message}`);
}

function pass(test) {
    passed++;
    log('✅', test);
}

function fail(test, reason) {
    failed++;
    log('❌', `${test}: ${reason}`);
}

async function makeRequest(options) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

async function runTests() {
    console.log('\n🔒 Testing Phase 1 Security Fixes\n');

    // Test 1.3: Localhost bypass requires env var
    console.log('📋 Test 1.3: Localhost Authentication Bypass');
    try {
        const res = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/status',
            method: 'GET'
        });
        
        if (process.env.ALLOW_LOCALHOST_BYPASS === 'true') {
            if (res.status === 200) {
                pass('Localhost bypass enabled - request succeeded');
            } else {
                fail('Localhost bypass enabled but request failed', `Status: ${res.status}`);
            }
        } else {
            if (res.status === 401) {
                pass('Localhost bypass disabled - auth required');
            } else {
                fail('Localhost bypass should require auth', `Got status ${res.status} instead of 401`);
            }
        }
    } catch (e) {
        fail('Localhost bypass test', e.message);
    }

    // Test 1.1: Auth key not in .tunnel-info.txt
    console.log('\n📋 Test 1.1: Auth Key Removal from File');
    const tunnelInfoPath = path.join(__dirname, '.tunnel-info.txt');
    if (fs.existsSync(tunnelInfoPath)) {
        const content = fs.readFileSync(tunnelInfoPath, 'utf-8');
        if (content.includes('Auth Key:')) {
            fail('Auth key still in .tunnel-info.txt', 'File contains "Auth Key:"');
        } else {
            pass('Auth key removed from .tunnel-info.txt');
        }
    } else {
        log('⚠️ ', '.tunnel-info.txt not found (tunnel not running)');
    }

    // Test 1.4: CORS hardening
    console.log('\n📋 Test 1.4: CORS Configuration');
    try {
        // Test with allowed origin
        const allowedRes = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/status',
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:3000',
                'X-Auth-Key': AUTH_KEY
            }
        });
        
        if (allowedRes.headers['access-control-allow-origin'] === 'http://localhost:3000') {
            pass('CORS allows whitelisted origin');
        } else {
            fail('CORS should allow localhost:3000', `Got: ${allowedRes.headers['access-control-allow-origin']}`);
        }

        if (allowedRes.headers['vary'] && allowedRes.headers['vary'].includes('Origin')) {
            pass('CORS includes Vary: Origin header');
        } else {
            fail('CORS missing Vary: Origin', 'Header not found');
        }

        // Test with disallowed origin
        const disallowedRes = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/status',
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://evil.com',
                'X-Auth-Key': AUTH_KEY
            }
        });

        if (!disallowedRes.headers['access-control-allow-origin'] || 
            disallowedRes.headers['access-control-allow-origin'] === 'null') {
            fail('CORS should omit header for disallowed origins', `Got: ${disallowedRes.headers['access-control-allow-origin']}`);
        } else if (disallowedRes.headers['access-control-allow-origin'] === 'http://evil.com') {
            fail('CORS allows non-whitelisted origin', 'evil.com should be blocked');
        } else {
            pass('CORS blocks disallowed origins');
        }
    } catch (e) {
        fail('CORS test', e.message);
    }

    // Test 1.5 & Codex fixes: File read security
    console.log('\n📋 Test 1.5: File Read Endpoint Security');
    try {
        // Test path traversal rejection
        const traversalRes = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/file/read?path=../../../etc/passwd',
            method: 'GET',
            headers: { 'X-Auth-Key': AUTH_KEY }
        });

        if (traversalRes.status === 403) {
            pass('Path traversal blocked (GET)');
        } else {
            fail('Path traversal should return 403', `Got: ${traversalRes.status}`);
        }

        // Test POST path traversal
        const postTraversalRes = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/file/read',
            method: 'POST',
            headers: {
                'X-Auth-Key': AUTH_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: '../../../etc/passwd' })
        });

        if (postTraversalRes.status === 403) {
            pass('Path traversal blocked (POST)');
        } else {
            fail('POST path traversal should return 403', `Got: ${postTraversalRes.status}`);
        }

        // Test type guard (array parameter)
        const arrayParamRes = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/file/read?path=a&path=b',
            method: 'GET',
            headers: { 'X-Auth-Key': AUTH_KEY }
        });

        if (arrayParamRes.status === 400 || arrayParamRes.status === 403) {
            pass('Type guard handles array parameters');
        } else {
            fail('Array parameter should return 400/403', `Got: ${arrayParamRes.status}`);
        }

        // Test existence oracle prevention (non-existent file outside workspace)
        const oracleRes = await makeRequest({
            hostname: 'localhost',
            port: 3500,
            path: '/api/file/read?path=/nonexistent/file.txt',
            method: 'GET',
            headers: { 'X-Auth-Key': AUTH_KEY }
        });

        if (oracleRes.status === 403) {
            pass('Path existence oracle prevented (generic 403)');
        } else {
            fail('Should return generic 403 for existence probing', `Got: ${oracleRes.status}`);
        }

    } catch (e) {
        fail('File read security test', e.message);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(50));

    if (failed > 0) {
        console.log('\n⚠️  Some tests failed. Review the output above.');
        process.exit(1);
    } else {
        console.log('\n🎉 All security fixes verified!');
        process.exit(0);
    }
}

// Check if server is running
http.get(BACKEND_URL + '/api/status', (res) => {
    runTests().catch(err => {
        console.error('Test error:', err);
        process.exit(1);
    });
}).on('error', (err) => {
    console.error('❌ Server not running at', BACKEND_URL);
    console.error('Start server first: npm run server');
    process.exit(1);
});
