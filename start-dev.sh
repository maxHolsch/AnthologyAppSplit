#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start the API server (Express on port 3001) in a new terminal window
echo "Starting API server..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR' && npm run dev:api\""

# Start the UI dev server (Vite on port 5173) in a new terminal window
echo "Starting UI dev server..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR' && npm run dev\""

echo "All services started."
echo "  API: http://localhost:3001"
echo "  UI:  http://localhost:5173"
