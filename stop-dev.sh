#!/bin/bash

# Stop the API server (Express on port 3001)
echo "Stopping API server..."
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null && echo "  API server stopped." || echo "  API server not running."

# Stop the UI dev server (Vite on port 5173)
echo "Stopping UI dev server..."
lsof -ti tcp:5173 | xargs kill -9 2>/dev/null && echo "  UI dev server stopped." || echo "  UI dev server not running."

echo "All services stopped."
