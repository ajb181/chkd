#!/bin/bash
# Restart stable server with fresh build
echo "Stopping stable server..."
lsof -ti:3848 | xargs kill -9 2>/dev/null || true
sleep 1

echo "Starting stable server..."
cd /Users/alex/chkd
npm run stable > /tmp/chkd-stable.log 2>&1 &

sleep 3
if lsof -i :3848 > /dev/null 2>&1; then
  echo "✓ Stable server running on port 3848"
else
  echo "✗ Failed to start stable server"
  cat /tmp/chkd-stable.log
  exit 1
fi
