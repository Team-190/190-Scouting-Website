#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ROOT_DIR="$(pwd)"

usage() {
    echo "Usage: ./run-local.sh [production|dev]"
    echo ""
    echo "Examples:"
    echo "  ./run-local.sh production"
    echo "  ./run-local.sh dev"
}

usage_error() {
    usage
    exit 1
}

# Argument handling
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
fi

if [[ -z "${1:-}" ]]; then
    usage_error
fi

if [[ -n "${2:-}" ]]; then
    usage_error
fi

MODE="$(echo "${1}" | tr '[:upper:]' '[:lower:]')"
if [[ "${MODE}" == "prod" ]]; then
    MODE="production"
fi

if [[ "${MODE}" != "production" && "${MODE}" != "dev" ]]; then
    echo "Invalid mode \"${1}\". Use production or dev."
    usage_error
fi

# Check required tools
if ! command -v npm &>/dev/null; then
    echo "npm is required but not found in PATH."
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo "node is required but not found in PATH."
    exit 1
fi

# Load ports from runtime constants
PORTS="$(node -e "const c=require('./runtime/constants'); process.stdout.write(c.ports.backend+' '+c.ports.frontend)")"
BACKEND_PORT="$(echo "$PORTS" | cut -d' ' -f1)"
FRONTEND_PORT="$(echo "$PORTS" | cut -d' ' -f2)"

if [[ -z "${BACKEND_PORT:-}" ]]; then
    echo "Failed to load runtime constants from runtime/constants.js"
    exit 1
fi

# Get current git branch
CURRENT_BRANCH="$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")"

export VITE_TESTING=1

# Install dependencies if missing
ensure_dependencies() {
    local dep_path="$1"
    local dep_label="$2"
    if [[ ! -d "${ROOT_DIR}/${dep_path}/node_modules" ]]; then
        echo "Installing ${dep_label} dependencies..."
        pushd "${ROOT_DIR}/${dep_path}" > /dev/null
        npm install
        popd > /dev/null
    fi
}

ensure_dependencies "backend" "backend"
ensure_dependencies "frontend" "frontend"

# Build frontend for production
if [[ "${MODE}" == "production" ]]; then
    echo "Building frontend for production..."
    pushd "${ROOT_DIR}/frontend" > /dev/null
    npm run build
    popd > /dev/null
fi

echo "Starting local runtime: branch=${CURRENT_BRANCH} mode=${MODE} backend_port=${BACKEND_PORT} frontend_port=${FRONTEND_PORT}"

# Launch a runtime in a new terminal window
launch_runtime() {
    local title="$1"
    local dir="$2"
    local cmd="$3"

    if [[ "$(uname)" == "Darwin" ]]; then
        osascript -e "tell application \"Terminal\" to activate" \
                  -e "tell application \"Terminal\" to do script \"cd '${dir}' && ${cmd}\""
    elif command -v gnome-terminal &>/dev/null; then
        gnome-terminal --title="${title}" --working-directory="${dir}" -- bash -c "${cmd}; exec bash" &
    elif command -v xterm &>/dev/null; then
        xterm -title "${title}" -e "cd '${dir}' && ${cmd}; bash" &
    else
        echo "Launching ${title} in background (no terminal emulator found)..."
        pushd "${dir}" > /dev/null
        bash -c "${cmd}" &
        popd > /dev/null
    fi
}

# Launch backend
if [[ "${MODE}" == "dev" ]]; then
    launch_runtime "MAMS Local Backend Runtime" "${ROOT_DIR}/backend" "npm run dev"
else
    launch_runtime "MAMS Local Backend Runtime" "${ROOT_DIR}/backend" "npm run start"
fi

# Launch frontend
if [[ "${MODE}" == "production" ]]; then
    launch_runtime "MAMS Local Frontend Runtime" "${ROOT_DIR}/frontend" "npm run preview"
else
    launch_runtime "MAMS Local Frontend Runtime" "${ROOT_DIR}/frontend" "npm run dev"
fi

# Open browser
sleep 1
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:${FRONTEND_PORT}"
elif [[ "$(uname)" == "Darwin" ]]; then
    open "http://localhost:${FRONTEND_PORT}"
fi

exit 0