#!/bin/bash
# Aslan Supermarket POS Launcher (LAN / Network Enabled)
cd "$(dirname "$0")"

# Find Wi-Fi / Local IP
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

echo "=========================================================="
echo "  🛒 ASLAN SUPERMARKET POS SYSTEM ONLINE!"
echo "=========================================================="
echo "  Local Terminal:  http://localhost:3000"
if [ "$LOCAL_IP" != "localhost" ]; then
echo "  Wi-Fi / LAN URL: http://$LOCAL_IP:3000"
echo "  (Open this Wi-Fi link from any other device or phone)"
fi
echo "=========================================================="

# Open browser on Mac
if [[ "$OSTYPE" == "darwin"* ]]; then
  (sleep 1 && open "http://localhost:3000") &
fi

# Run Node server
node server.js
