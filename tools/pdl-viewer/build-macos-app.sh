#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

osacompile -o "PDL-Viewer.app" build-app.applescript
echo "PDL-Viewer.app erstellt."
echo "Doppelklick auf PDL-Viewer.app oder ins Dock ziehen."
