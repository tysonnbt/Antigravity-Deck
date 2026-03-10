#!/bin/bash
# Test runner for JWT backend implementation

echo "🧪 Starting JWT Backend Test..."
echo ""

# Set environment variables
export JWT_SECRET="FFBqYGHJkER6W/tIKG1vEa0/E7VNh2RbvEwYrxbvon4="
export AUTH_KEY="test-key-12345678"
export ALLOW_LOCALHOST_BYPASS="false"
export NODE_ENV="development"
export PORT="3500"

# Start server in background
echo "Starting server with JWT authentication..."
node server.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Run tests
echo ""
echo "Running JWT authentication tests..."
echo ""
node test-jwt-backend.js

# Capture test exit code
TEST_EXIT_CODE=$?

# Kill server
echo ""
echo "Shutting down server..."
kill $SERVER_PID 2>/dev/null

# Exit with test result
exit $TEST_EXIT_CODE
