@echo off

echo Starting backend server...
if not exist backend\node_modules (
    echo Installing backend dependencies...
    cd backend
    npm install
    cd ..
)
start "Backend" cmd /k "cd backend && npm start"

echo Starting frontend server...
if not exist frontend\node_modules (
    echo Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
)
start "Frontend" cmd /k "cd frontend && npm run dev"