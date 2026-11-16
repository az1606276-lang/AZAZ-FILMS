#!/usr/bin/env bash
set -euo pipefail
echo "=== AZ FILMS Free Deploy to Firebase Hosting ==="
npm install
npx -y firebase-tools login
npm run deploy:free
echo "Done! Live URL: https://gen-lang-client-0286519577.web.app"
