#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PID=$(lsof -Pi :8080 -sTCP:LISTEN -t 2>/dev/null)
if [ -n "$PID" ]; then
    kill "$PID"
    sleep 0.5
fi

python3 -m http.server 8080 &>/dev/null &
sleep 1

open http://localhost:8080/web/
