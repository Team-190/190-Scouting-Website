#!/bin/bash

echo "Starting backend server..."

if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend || exit 1
    npm install
    cd ..
fi

# Start backend in a new Terminal window (macOS)
osascript -e 'tell application "Terminal" to do script "cd '"$(pwd)"'/backend && npm start"'

echo "Starting frontend server..."

if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend || exit 1
    npm install
    cd ..
fi

# Start frontend in a new Terminal window (macOS)
osascript -e 'tell application "Terminal" to do script "cd '"$(pwd)"'/frontend && npm run dev"'
