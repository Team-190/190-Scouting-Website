# 190-Scouting-Website

## Runtime

Server commands:

- `.\run-server.bat main production`
- `.\run-server.bat dev production`
- `.\run-server.bat main dev`
- `.\run-server.bat dev dev`

Local commands (current branch):

- `.\run-local.bat production`
- `.\run-local.bat dev`

Notes:

- `run-server.bat` includes git polling and auto-restart after pulls.
- `run-local.bat` does not poll git.
- Both scripts auto-install missing backend/frontend dependencies.
- Frontend port is fixed at `5173` and backend port is fixed at `8000` for local and server modes.
- Port values are centralized in `runtime/constants.js` (not `.env`).
