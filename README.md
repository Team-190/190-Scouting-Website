# 190-Scouting-Website

## Runtime

Commands:

- `./run-local.bat`
- `./run-server.bat`

Behavior:

- `run-local.bat` runs the current branch in local development mode.
- `run-server.bat` runs the current branch in server production mode.
- Neither script performs git polling or automatic pulls.
- Both scripts auto-install missing backend/frontend dependencies.
- Frontend port is fixed at `5173` and backend port is fixed at `8000`.

Notes:

- Port values are centralized in `runtime/constants.js` (not `.env`).
