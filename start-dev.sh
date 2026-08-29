#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Next.js dev server on port 3000..."
node node_modules/next/dist/bin/next dev -p 3000 2>&1
