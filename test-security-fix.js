// Security Fix Verification Tests
// Tests for Pre-Phase 0: Command Injection & Path Traversal fixes

const http = require('http');

const BASE_URL = 'http://localhost:3500';
const WORKSPACE_NAME = 'test-workspace'; // Replace with actual workspace name

// Helper: Make HTTP request
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${path}`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: JSON.parse(data)
                });
            });
        }).on('error', reject);
    });
}

// Test cases
const tests = [
    {
        name: 'Git Diff - Normal file (should work)',
        path: `/api/workspaces/${WORKSPACE_NAME}/git/diff?file=README.md`,
        expectStatus: 200,
        expectError: false
    },
    {
        name: 'Git Diff - Command injection attempt (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/git/diff?file=test.js; rm -rf /`,
        expectStatus: 400,
        expectError: true,
        expectMessage: 'disallowed characters'
    },
    {
        name: 'Git Diff - Shell metacharacter $(whoami) (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/git/diff?file=test$(whoami).js`,
        expectStatus: 400,
        expectError: true,
        expectMessage: 'disallowed characters'
    },
    {
        name: 'Git Show - Normal file (should work)',
        path: `/api/workspaces/${WORKSPACE_NAME}/git/show?file=package.json`,
        expectStatus: 200,
        expectError: false
    },
    {
        name: 'Git Show - Path traversal (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/git/show?file=../../etc/passwd`,
        expectStatus: 400,
        expectError: true,
        expectMessage: 'path traversal'
    },
    {
        name: 'Git Show - Absolute path (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/git/show?file=/etc/passwd`,
        expectStatus: 400,
        expectError: true,
        expectMessage: 'absolute paths'
    },
    {
        name: 'File Read - Normal file (should work)',
        path: `/api/workspaces/${WORKSPACE_NAME}/file/read?file=package.json`,
        expectStatus: 200,
        expectError: false
    },
    {
        name: 'File Read - Path traversal with .. (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/file/read?file=../../../etc/passwd`,
        expectStatus: 403,
        expectError: true,
        expectMessage: 'path traversal'
    },
    {
        name: 'File Read - Absolute path (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/file/read?file=/etc/passwd`,
        expectStatus: 403,
        expectError: true,
        expectMessage: 'absolute paths'
    },
    {
        name: 'File Read - Windows absolute path (should fail)',
        path: `/api/workspaces/${WORKSPACE_NAME}/file/read?file=C:/Windows/System32/config/sam`,
        expectStatus: 403,
        expectError: true,
        expectMessage: 'absolute paths'
    }
];

// Run tests
async function runTests() {
    console.log('🔒 Security Fix Verification Tests\n');
    console.log('Pre-Phase 0: Command Injection & Path Traversal Protection\n');
    console.log('='.repeat(70));
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = await makeRequest(test.path);
            const statusMatch = result.status === test.expectStatus;
            const errorMatch = test.expectError ? !!result.body.error : !result.body.error;
            const messageMatch = test.expectMessage 
                ? result.body.error?.toLowerCase().includes(test.expectMessage.toLowerCase())
                : true;
            
            if (statusMatch && errorMatch && messageMatch) {
                console.log(`✅ PASS: ${test.name}`);
                console.log(`   Status: ${result.status}, Error: ${result.body.error || 'none'}`);
                passed++;
            } else {
                console.log(`❌ FAIL: ${test.name}`);
                console.log(`   Expected: status=${test.expectStatus}, error=${test.expectError}`);
                console.log(`   Got: status=${result.status}, error=${result.body.error || 'none'}`);
                failed++;
            }
        } catch (err) {
            console.log(`❌ ERROR: ${test.name}`);
            console.log(`   ${err.message}`);
            failed++;
        }
        console.log('');
    }
    
    console.log('='.repeat(70));
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests\n`);
    
    if (failed === 0) {
        console.log('🎉 All security tests passed! Command injection and path traversal vulnerabilities are fixed.\n');
    } else {
        console.log('⚠️  Some tests failed. Please review the implementation.\n');
    }
}

// Check if server is running
http.get(`${BASE_URL}/api/status`, (res) => {
    if (res.statusCode === 200) {
        runTests();
    } else {
        console.log('❌ Server not responding. Please start the server first: npm run dev');
    }
}).on('error', () => {
    console.log('❌ Cannot connect to server. Please start the server first: npm run dev');
    console.log(`   Expected server at: ${BASE_URL}`);
});
