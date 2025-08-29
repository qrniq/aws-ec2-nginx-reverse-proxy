#!/bin/bash
# Standalone Chrome Remote Debugging Startup Script
# For AWS EC2 Amazon Linux 2023
# Author: Terragon Labs

set -e

# Configuration
CHROME_PORT=${CHROME_PORT:-9222}
NGINX_PORT=$((CHROME_PORT + 1))
DISPLAY=${DISPLAY:-:99}
CHROME_USER_DATA_DIR="/tmp/chrome-debug-${CHROME_PORT}"
HEADLESS=${HEADLESS:-true}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Help function
show_help() {
    cat << EOF
Chrome Remote Debugging Startup Script

Usage: $0 [OPTIONS]

Options:
    -p, --port PORT         Chrome debugging port (default: 9222)
    -d, --display DISPLAY   X11 display for Xvfb (default: :99)
    -u, --user-data DIR     Chrome user data directory (default: /tmp/chrome-debug-PORT)
    --gui                   Run Chrome with GUI (disable headless mode)
    --kill                  Kill existing Chrome processes and exit
    --status               Check Chrome debugging status
    -h, --help             Show this help message

Examples:
    $0                      # Start Chrome on port 9222 (headless)
    $0 -p 9333              # Start Chrome on port 9333
    $0 --gui                # Start Chrome with GUI
    $0 --kill               # Kill all Chrome processes
    $0 --status             # Check if Chrome debugger is running

Environment Variables:
    CHROME_PORT             Chrome debugging port (default: 9222)
    DISPLAY                 X11 display (default: :99)
    HEADLESS               Run headless (true/false, default: true)

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--port)
            CHROME_PORT="$2"
            NGINX_PORT=$((CHROME_PORT + 1))
            CHROME_USER_DATA_DIR="/tmp/chrome-debug-${CHROME_PORT}"
            shift 2
            ;;
        -d|--display)
            DISPLAY="$2"
            shift 2
            ;;
        -u|--user-data)
            CHROME_USER_DATA_DIR="$2"
            shift 2
            ;;
        --gui)
            HEADLESS=false
            shift
            ;;
        --kill)
            log "Killing Chrome processes..."
            pkill -f google-chrome || true
            pkill -f chrome || true
            log "Chrome processes killed"
            exit 0
            ;;
        --status)
            if curl -s "http://localhost:${CHROME_PORT}/json/version" > /dev/null 2>&1; then
                log "Chrome debugger is running on port ${CHROME_PORT}"
                curl -s "http://localhost:${CHROME_PORT}/json/version" | python3 -m json.tool 2>/dev/null || echo "Chrome is running but version info unavailable"
                if command -v systemctl &> /dev/null && systemctl is-active --quiet nginx; then
                    log "Nginx proxy is available on port ${NGINX_PORT}"
                fi
            else
                warn "Chrome debugger is not running on port ${CHROME_PORT}"
                exit 1
            fi
            exit 0
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1. Use --help for usage information."
            ;;
    esac
done

# Validate Chrome port
if ! [[ "$CHROME_PORT" =~ ^[0-9]+$ ]] || [ "$CHROME_PORT" -lt 1024 ] || [ "$CHROME_PORT" -gt 65535 ]; then
    error "Invalid port number: $CHROME_PORT. Please use a port between 1024 and 65535."
fi

log "Starting Chrome Remote Debugging..."
log "Chrome debugging port: ${CHROME_PORT}"
log "Nginx proxy port: ${NGINX_PORT}"
log "Headless mode: ${HEADLESS}"
log "Display: ${DISPLAY}"
log "User data directory: ${CHROME_USER_DATA_DIR}"

# Check if Chrome is already running on the specified port
if curl -s "http://localhost:${CHROME_PORT}/json" > /dev/null 2>&1; then
    warn "Chrome is already running on port ${CHROME_PORT}"
    log "Use '$0 --kill' to stop existing Chrome processes"
    exit 1
fi

# Check if Google Chrome is installed
if ! command -v google-chrome &> /dev/null; then
    error "Google Chrome is not installed. Please install Chrome first."
fi

# Kill existing Chrome processes on the same port
log "Checking for existing Chrome processes..."
if pgrep -f "remote-debugging-port=${CHROME_PORT}" > /dev/null; then
    log "Killing existing Chrome process on port ${CHROME_PORT}..."
    pkill -f "remote-debugging-port=${CHROME_PORT}" || true
    sleep 3
fi

# Setup Xvfb for headless mode
if [[ "$HEADLESS" == "true" ]]; then
    # Check if Xvfb is installed
    if ! command -v Xvfb &> /dev/null; then
        error "Xvfb is not installed. Please install xorg-x11-server-Xvfb package."
    fi

    # Start Xvfb if not already running on this display
    if ! pgrep -f "Xvfb ${DISPLAY}" > /dev/null; then
        log "Starting Xvfb on display ${DISPLAY}..."
        Xvfb ${DISPLAY} -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
        XVFB_PID=$!
        sleep 3

        # Verify Xvfb started successfully
        if ! kill -0 $XVFB_PID 2>/dev/null; then
            error "Failed to start Xvfb"
        fi
        log "Xvfb started successfully (PID: $XVFB_PID)"
    else
        log "Xvfb is already running on display ${DISPLAY}"
    fi
fi

# Create user data directory
mkdir -p "${CHROME_USER_DATA_DIR}"
chmod 755 "${CHROME_USER_DATA_DIR}"

# Build Chrome command
CHROME_CMD="google-chrome"
CHROME_ARGS=(
    "--remote-debugging-address=0.0.0.0"
    "--remote-debugging-port=${CHROME_PORT}"
    "--user-data-dir=${CHROME_USER_DATA_DIR}"
    "--no-first-run"
    "--no-default-browser-check"
    "--disable-background-timer-throttling"
    "--disable-backgrounding-occluded-windows"
    "--disable-renderer-backgrounding"
    "--disable-features=TranslateUI"
    "--disable-ipc-flooding-protection"
    "--enable-logging"
    "--log-level=0"
    "--v=1"
)

# Add headless-specific arguments
if [[ "$HEADLESS" == "true" ]]; then
    CHROME_ARGS+=(
        "--headless"
        "--no-sandbox"
        "--disable-dev-shm-usage"
        "--disable-gpu"
        "--disable-software-rasterizer"
        "--disable-background-networking"
        "--disable-default-apps"
        "--disable-extensions"
        "--disable-sync"
        "--metrics-recording-only"
        "--no-first-run"
    )
    export DISPLAY="${DISPLAY}"
else
    log "Starting Chrome with GUI..."
fi

# Start Chrome
log "Starting Chrome with remote debugging..."
log "Command: ${CHROME_CMD} ${CHROME_ARGS[*]} about:blank"

if [[ "$HEADLESS" == "true" ]]; then
    DISPLAY=${DISPLAY} "${CHROME_CMD}" "${CHROME_ARGS[@]}" "about:blank" &
else
    "${CHROME_CMD}" "${CHROME_ARGS[@]}" "about:blank" &
fi

CHROME_PID=$!
log "Chrome started (PID: ${CHROME_PID})"

# Wait for Chrome to be ready
log "Waiting for Chrome debugger to be ready..."
RETRY_COUNT=0
MAX_RETRIES=30

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:${CHROME_PORT}/json" > /dev/null 2>&1; then
        log "✓ Chrome debugger is ready on port ${CHROME_PORT}"
        break
    fi
    
    # Check if Chrome process is still running
    if ! kill -0 $CHROME_PID 2>/dev/null; then
        error "Chrome process died unexpectedly"
    fi
    
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
done

echo ""

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    error "Chrome debugger failed to start after ${MAX_RETRIES} attempts"
fi

# Display connection information
log "✓ Chrome Remote Debugging is ready!"
echo ""
echo -e "${BLUE}=== Connection Information ===${NC}"
echo -e "${GREEN}Local Chrome debugger URL:${NC} http://localhost:${CHROME_PORT}"
echo -e "${GREEN}Local nginx proxy URL:${NC} http://localhost:${NGINX_PORT}"
echo -e "${GREEN}DevTools frontend:${NC} http://localhost:${CHROME_PORT}/devtools/inspector.html"

# Get EC2 public IP if available
if command -v curl &> /dev/null; then
    PUBLIC_IP=$(curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")
    if [[ -n "$PUBLIC_IP" ]]; then
        echo -e "${YELLOW}External nginx proxy URL:${NC} http://${PUBLIC_IP}:${NGINX_PORT}"
        echo -e "${YELLOW}External DevTools URL:${NC} http://${PUBLIC_IP}:${NGINX_PORT}/devtools/inspector.html"
    fi
fi

# Display available endpoints
echo ""
echo -e "${BLUE}=== Available Endpoints ===${NC}"
curl -s "http://localhost:${CHROME_PORT}/json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for item in data[:3]:  # Show first 3 tabs
        print(f\"Tab: {item.get('title', 'Unknown')} - {item.get('url', 'about:blank')}\")
        print(f\"  WebSocket: {item.get('webSocketDebuggerUrl', 'N/A')}\")
except:
    print('Could not parse Chrome debugger response')
" 2>/dev/null || log "Chrome debugger endpoints available at /json"

echo ""
log "Chrome is running. Use Ctrl+C to stop or run '$0 --kill' from another terminal."

# Wait for Chrome process or handle interruption
trap 'log "Shutting down..."; kill $CHROME_PID 2>/dev/null; exit 0' INT TERM

wait $CHROME_PID