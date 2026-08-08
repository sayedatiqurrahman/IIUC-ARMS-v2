#!/bin/bash
# Run this ONCE to register all bot commands with Telegram
# Usage: bash scripts/setup-telegram-commands.sh

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN env var is required}"
API="https://api.telegram.org/bot${BOT_TOKEN}"

echo "Setting bot commands..."

curl -s "${API}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
  "commands": [
    {"command": "start", "description": "Welcome message & main menu"},
    {"command": "help", "description": "List all available commands"},
    {"command": "connect", "description": "Link your IIUC-ARMS account (interactive)"},
    {"command": "disconnect", "description": "Unlink your account"},
    {"command": "status", "description": "Check connection status"},
    {"command": "courses", "description": "List all courses (dept > sem > courses)"},
    {"command": "departments", "description": "List all departments with links"},
    {"command": "semester", "description": "Browse a semester (e.g. /semester 3)"},
    {"command": "search", "description": "Search files by name (e.g. /search notes)"},
    {"command": "stats", "description": "View site statistics"},
    {"command": "broadcast", "description": "Send announcement to all users (owner only)"}
  ],
  "commands_scope": [
    {"type": "default"},
    {"type": "chat", "chat_id": 0, "permissions": ["can_send_messages"]}
  ]
}' | python3 -m json.tool 2>/dev/null || echo "Response received"

echo ""
echo "Done! Commands registered."
echo "Test by sending /help to your bot."
