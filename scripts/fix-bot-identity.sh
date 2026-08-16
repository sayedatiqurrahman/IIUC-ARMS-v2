#!/bin/bash
# Reset the Telegram bot's identity (name / description / about / commands) and
# re-point the webhook. Run this after changing TELEGRAM_BOT_TOKEN to undo any
# spam takeover (porn links in the "What can this bot do?" section, etc.).
#
# The token is read from the TELEGRAM_BOT_TOKEN env var, or from .env.local
# when present. Never prints the token.
#
# Usage: bash scripts/fix-bot-identity.sh

set -e

# Load .env.local if present (must not echo its contents)
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN is not set. Add it to .env.local or export it." >&2
  exit 1
fi

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://iiuc-arms.eu.cc}"

BOT_NAME="IIUC-ARMS Bot"

BOT_DESCRIPTION="IIUC-ARMS — academic hub for IIUC. Notes, previous questions, slides, books & syllabuses for every department.

How to use:
• Send any course code (e.g. QSM-3602) to get its files
• /departments — browse by faculty
• /semester 3 — browse a semester
• /search notes — search every file
• /stats
• /connect yourid@ugram.iiuc.ac.bd — link your account

App: ${SITE_URL}
Repos: https://github.com/sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER and https://github.com/sayedatiqurrahman/IIUC-ARMS-v2"

BOT_SHORT="Academic resources for IIUC courses — notes, questions, slides & books. Made by Sayed Atiqur Rahman (Programming Light)."

BOT_ABOUT="IIUC-ARMS academic resources for IIUC. Built by Sayed Atiqur Rahman (Programming Light). ${SITE_URL}"

echo "→ Verifying token (getMe)..."
curl -s "${API}/getMe" | python3 -m json.tool 2>/dev/null || curl -s "${API}/getMe"

echo ""
echo "→ Setting bot name..."
curl -s "${API}/setMyName" -H "Content-Type: application/json" \
  -d "{\"name\":\"${BOT_NAME}\"}" | python3 -m json.tool 2>/dev/null || true

echo ""
echo "→ Setting bot description (\"What can this bot do?\")..."
curl -s "${API}/setMyDescription" -H "Content-Type: application/json" \
  -d "{\"description\":$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$BOT_DESCRIPTION")}" | python3 -m json.tool 2>/dev/null || true

echo ""
echo "→ Setting short description..."
curl -s "${API}/setMyShortDescription" -H "Content-Type: application/json" \
  -d "{\"short_description\":$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$BOT_SHORT")}" | python3 -m json.tool 2>/dev/null || true

echo ""
echo "→ Setting about (bot profile)..."
curl -s "${API}/setMyAbout" -H "Content-Type: application/json" \
  -d "{\"about\":$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$BOT_ABOUT")}" | python3 -m json.tool 2>/dev/null || true

echo ""
echo "→ Setting bot commands..."
curl -s "${API}/setMyCommands" -H "Content-Type: application/json" \
  -d '{
  "commands": [
    {"command": "start", "description": "Welcome message & main menu"},
    {"command": "help", "description": "List all available commands"},
    {"command": "connect", "description": "Link your IIUC-ARMS account"},
    {"command": "disconnect", "description": "Unlink your account"},
    {"command": "status", "description": "Check connection status"},
    {"command": "courses", "description": "List all courses (dept > sem > courses)"},
    {"command": "departments", "description": "List all departments with links"},
    {"command": "semester", "description": "Browse a semester (e.g. /semester 3)"},
    {"command": "search", "description": "Search files by name (e.g. /search notes)"},
    {"command": "stats", "description": "View site statistics"},
    {"command": "broadcast", "description": "Send announcement to all users (owner only)"}
  ]
}' | python3 -m json.tool 2>/dev/null || true

echo ""
echo "→ Re-pointing webhook to ${SITE_URL}/api/telegram/webhook ..."
WEBHOOK_SECRET="${TELEGRAM_BOT_WEBHOOK_SECRET:-${TELEGRAM_BOT_TOKEN}}"
# The app's webhook handler rejects updates unless X-Telegram-Bot-Api-Secret-Token
# matches (TELEGRAM_BOT_WEBHOOK_SECRET, falling back to TELEGRAM_BOT_TOKEN), so the
# webhook MUST be registered with the same secret_token.
curl -s "${API}/setWebhook" -H "Content-Type: application/json" \
  -d "{\"url\":\"${SITE_URL}/api/telegram/webhook\",\"secret_token\":$(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$WEBHOOK_SECRET"),\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}" | python3 -m json.tool 2>/dev/null || true

echo ""
echo "→ Webhook info:"
curl -s "${API}/getWebhookInfo" | python3 -m json.tool 2>/dev/null || curl -s "${API}/getWebhookInfo"

echo ""
echo "Done! The bot should now show the clean welcome message."
